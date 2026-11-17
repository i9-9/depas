"use client";

import { useEffect, useMemo, useState } from "react";
import { FavoriteButton, StarIcon } from "@/components/FavoriteMark";
import { Photo } from "@/components/Photo";
import { VisitPad } from "@/components/VisitPad";
import { addedOn, formatNum, siteLabel, streetOf } from "@/lib/listings";
import type { Amiga } from "@/lib/load-amiga";
import { TIER_LABEL, rankAmiga, type Check, type CheckState, type Ranked } from "@/lib/rank-amiga";
import { readPrefs, toggleId, writePrefs } from "@/lib/storage";

type SortKey = "fit" | "price" | "m2price" | "area" | "new";

type Filters = {
  q: string;
  zone: string;
  amb: 0 | 2 | 3;
  site: string;
  maxPrice: string;
  minArea: string;
  onlySaved: boolean;
  onlyDiscarded: boolean;
  onlyNew: boolean;
  norte: boolean;
  parquet: boolean;
  balcon5: boolean;
  alto: boolean;
  noAvenue: boolean;
};

const INITIAL: Filters = {
  q: "",
  zone: "",
  amb: 0,
  site: "",
  maxPrice: "",
  minArea: "",
  onlySaved: false,
  onlyDiscarded: false,
  onlyNew: false,
  norte: false,
  parquet: false,
  balcon5: false,
  alto: false,
  noAvenue: false,
};

const SORTS: { id: SortKey; label: string }[] = [
  { id: "fit", label: "Mejor ajuste" },
  { id: "price", label: "Precio, de menor a mayor" },
  { id: "m2price", label: "USD por m², de menor a mayor" },
  { id: "area", label: "Más metros" },
  { id: "new", label: "Más nuevos" },
];

const DAY = 86_400_000;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function toNum(s: string): number | null {
  const n = Number(s.replace(/\D/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

/** Los de la primera tanda no son "nuevos": solo los que entraron después. */
function newIds(rows: Amiga[], now: number): Set<string> {
  const ts = rows.map((r) => Date.parse(r.first_seen || "")).filter((t) => !Number.isNaN(t));
  if (!ts.length) return new Set();
  const wave = Math.min(...ts) + 36 * 3_600_000;
  return new Set(
    rows
      .filter((r) => {
        const t = Date.parse(r.first_seen || "");
        return !Number.isNaN(t) && t > wave && now - t <= 3 * DAY;
      })
      .map((r) => r.id),
  );
}

/** El texto de la card trae precio, m² y dirección arriba; la descripción empieza en la primera línea larga. */
function description(item: Amiga): string {
  const lines = (item.blurb || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => l.length >= 50);
  const body = (at >= 0 ? lines.slice(at) : []).join(" ").replace(/\s+/g, " ");
  const text = body || item.title || "";
  return text.length > 650 ? `${text.slice(0, 650).replace(/\s+\S*$/, "")}…` : text;
}

function passes(
  r: Ranked,
  f: Filters,
  saved: string[],
  discarded: string[],
  fresh: Set<string>,
): boolean {
  const it = r.item;
  const isDiscarded = discarded.includes(it.id);
  if (f.onlyDiscarded ? !isDiscarded : isDiscarded) return false;
  if (f.onlySaved && !saved.includes(it.id)) return false;
  if (f.onlyNew && !fresh.has(it.id)) return false;
  if (f.zone && it.zone !== f.zone) return false;
  if (f.site && it.site !== f.site) return false;
  if (f.amb && it.ambientes !== f.amb) return false;
  const maxP = toNum(f.maxPrice);
  if (maxP != null && (it.price ?? Infinity) > maxP) return false;
  const minA = toNum(f.minArea);
  if (minA != null && (it.area_covered ?? it.area ?? 0) < minA) return false;
  if (f.norte && !r.facets.norte) return false;
  if (f.parquet && !r.facets.parquet) return false;
  if (f.balcon5 && !r.facets.balcon5) return false;
  if (f.alto && !r.facets.alto) return false;
  if (f.noAvenue && r.onAvenue) return false;
  if (f.q.trim()) {
    const hay = fold(`${it.address} ${it.title} ${it.zone}`);
    if (!f.q.trim().split(/\s+/).every((w) => hay.includes(fold(w)))) return false;
  }
  return true;
}

export function AmigaCatalog({ rows, lastChange }: { rows: Amiga[]; lastChange: string | null }) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [sort, setSort] = useState<SortKey>("fit");
  const [saved, setSaved] = useState<string[]>([]);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const prefs = readPrefs();
    setSaved(prefs.saved);
    setDiscarded(prefs.discarded);
    setNow(Date.now());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writePrefs({ saved, discarded });
  }, [saved, discarded, ready]);

  const ranked = useMemo(() => rankAmiga(rows), [rows]);
  const fresh = useMemo(() => (now ? newIds(rows, now) : new Set<string>()), [rows, now]);
  const posOf = useMemo(() => new Map(ranked.map((r, i) => [r.item.id, i + 1])), [ranked]);

  const zones = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of ranked) if (r.item.zone) c.set(r.item.zone, (c.get(r.item.zone) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [ranked]);
  const sites = useMemo(() => [...new Set(rows.map((r) => r.site))], [rows]);

  const visible = useMemo(() => {
    const list = ranked.filter((r) => passes(r, filters, saved, discarded, fresh));
    const by: Record<SortKey, (a: Ranked, b: Ranked) => number> = {
      fit: () => 0,
      price: (a, b) => (a.item.price ?? 1e12) - (b.item.price ?? 1e12),
      m2price: (a, b) => (a.usdM2 ?? 1e12) - (b.usdM2 ?? 1e12),
      area: (a, b) => (b.item.area_covered ?? b.item.area ?? 0) - (a.item.area_covered ?? a.item.area ?? 0),
      new: (a, b) => Date.parse(b.item.first_seen || "") - Date.parse(a.item.first_seen || ""),
    };
    return sort === "fit" ? list : list.slice().sort(by[sort]);
  }, [ranked, filters, saved, discarded, fresh, sort]);

  useEffect(() => {
    if (openId && !visible.some((r) => r.item.id === openId)) setOpenId(null);
  }, [visible, openId]);

  const prices = visible.map((r) => r.item.price).filter((p): p is number => p != null);
  const medM2 = median(visible.map((r) => r.usdM2).filter((x): x is number => x != null));
  const activeFilters = JSON.stringify({ ...filters, onlySaved: false, onlyDiscarded: false }) !== JSON.stringify(INITIAL);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "onlyDiscarded" && value) next.onlySaved = false;
      if (key === "onlySaved" && value) next.onlyDiscarded = false;
      return next;
    });
  }

  function toggleSave(id: string) {
    const on = saved.includes(id);
    setSaved((p) => toggleId(p, id));
    setDiscarded((p) => p.filter((x) => x !== id));
    setNote(on ? "Sacado de guardados." : "Guardado para después.");
  }

  function toggleDiscard(id: string) {
    const on = discarded.includes(id);
    setDiscarded((p) => toggleId(p, id));
    setSaved((p) => p.filter((x) => x !== id));
    setNote(on ? "Volvió a la lista." : "Sacado de la lista.");
  }

  return (
    <div>
      <div className="border-b border-line">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)]">
          <label className="block">
            <span className="sr-only">Buscar calle</span>
            <input
              className="input w-full"
              type="search"
              placeholder="Buscar calle o barrio"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </label>
          <label className="block border-t border-line sm:border-l sm:border-t-0">
            <span className="sr-only">Ordenar</span>
            <select
              className="input w-full"
              value={sort}
              aria-label="Ordenar"
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line py-2" role="group" aria-label="Barrio">
          <Chip on={!filters.zone} onClick={() => set("zone", "")}>
            Todos <span className="idx text-muted">{ranked.length}</span>
          </Chip>
          {zones.map(([z, n]) => (
            <Chip key={z} on={filters.zone === z} onClick={() => set("zone", filters.zone === z ? "" : z)}>
              {z} <span className="idx text-muted">{n}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-5 border-t border-line">
          <div className="flex flex-wrap gap-x-5">
            <Toggle on={filters.onlySaved} onChange={(v) => set("onlySaved", v)} label="Guardados" icon />
            <Toggle on={filters.norte} onChange={(v) => set("norte", v)} label="Norte" />
            <Toggle on={filters.balcon5} onChange={(v) => set("balcon5", v)} label="Balcón 5 m²+" />
            <Toggle on={filters.alto} onChange={(v) => set("alto", v)} label="Vista alta" />
            <Toggle on={filters.parquet} onChange={(v) => set("parquet", v)} label="Parquet" />
            <Toggle on={filters.noAvenue} onChange={(v) => set("noAvenue", v)} label="Sin avenidas" />
            {fresh.size > 0 ? <Toggle on={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Nuevos" /> : null}
            {discarded.length > 0 ? (
              <Toggle on={filters.onlyDiscarded} onChange={(v) => set("onlyDiscarded", v)} label="Sacados" />
            ) : null}
          </div>
          <p aria-live="polite" aria-atomic="true" className="idx kicker text-muted">
            {ready ? `${visible.length} de ${ranked.length}` : "…"}
          </p>
        </div>

        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center border-b-2 border-transparent text-ink [&::-webkit-details-marker]:hidden">
            Más filtros
          </summary>
          <div className="grid gap-x-5 gap-y-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Ambientes">
              <div className="seg" role="group" aria-label="Ambientes">
                {([0, 2, 3] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={filters.amb === n} onClick={() => set("amb", n)}>
                    {n === 0 ? "Todos" : `${n} amb`}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Precio máximo (USD)">
              <input
                className="input idx"
                inputMode="numeric"
                placeholder="Máximo"
                value={filters.maxPrice}
                onChange={(e) => set("maxPrice", e.target.value)}
              />
            </Field>
            <Field label="Metros mínimos">
              <input
                className="input idx"
                inputMode="numeric"
                placeholder="Mínimo"
                value={filters.minArea}
                onChange={(e) => set("minArea", e.target.value)}
              />
            </Field>
            <Field label="Portal">
              <select className="input" value={filters.site} onChange={(e) => set("site", e.target.value)}>
                <option value="">Todos</option>
                {sites.map((s) => (
                  <option key={s} value={s}>
                    {siteLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-[0.8125rem] text-muted">
        <p className="idx">
          {prices.length
            ? `USD ${formatNum(Math.min(...prices))} a ${formatNum(Math.max(...prices))}`
            : "Sin resultados"}
          {medM2 ? ` · mediana USD ${formatNum(medM2)}/m²` : ""}
        </p>
        <p>{lastChange ? `Revisado ${addedOn(lastChange)}` : ""}</p>
      </div>
      <p aria-live="polite" className={note ? "kicker pb-2 text-muted" : "sr-only"}>
        {note}
      </p>

      {!visible.length ? (
        <div className="max-w-md py-16">
          <h2 className="display text-title">
            {filters.onlySaved ? "Todavía no guardaste ninguno" : "Ninguno con esos filtros"}
          </h2>
          <p className="measure mt-4 text-ink">
            {filters.onlySaved
              ? "Tocá la estrella en los que te gusten y quedan acá."
              : "Probá sacar algún filtro o ampliar el precio."}
          </p>
          {activeFilters ? (
            <button type="button" className="btn-solid mt-6" onClick={() => setFilters(INITIAL)}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="border-t border-line">
          {visible.map((r) => (
            <li key={r.item.id} className="border-b border-line">
              <Row
                r={r}
                pos={posOf.get(r.item.id) || 0}
                open={openId === r.item.id}
                saved={saved.includes(r.item.id)}
                discarded={discarded.includes(r.item.id)}
                isNew={fresh.has(r.item.id)}
                onToggle={() => setOpenId(openId === r.item.id ? null : r.item.id)}
                onSave={() => toggleSave(r.item.id)}
                onDiscard={() => toggleDiscard(r.item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 border-b-2 whitespace-nowrap ${
        on ? "border-accent font-bold text-title" : "border-transparent text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  on,
  onChange,
  label,
  icon = false,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex min-h-11 items-center gap-1.5 border-b-2 ${on ? "border-accent text-title" : "border-transparent text-ink"}`}
    >
      {icon ? <StarIcon on={on} size={16} /> : null}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="kicker text-muted">{label}</p>
      {children}
    </div>
  );
}

function TierPill({ tier, score }: { tier: Ranked["tier"]; score: number }) {
  const cls =
    tier === "top"
      ? "bg-title text-bg"
      : tier === "buena"
        ? "border border-title text-title"
        : "border border-line text-muted";
  return (
    <span className={`kicker inline-block px-1.5 py-0.5 ${cls}`} title={`${score} puntos`}>
      {TIER_LABEL[tier]} · {score}
    </span>
  );
}

function Actions({
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  saved: boolean;
  discarded: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <FavoriteButton on={saved} onClick={onSave} size="sm" />
      <button
        type="button"
        onClick={onDiscard}
        aria-pressed={discarded}
        aria-label={discarded ? "Volver a mostrar" : "No me interesa"}
        className={`hit-44 grid size-11 place-items-center ${discarded ? "text-title" : "text-ink"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}

function Row({
  r,
  pos,
  open,
  saved,
  discarded,
  isNew,
  onToggle,
  onSave,
  onDiscard,
}: {
  r: Ranked;
  pos: number;
  open: boolean;
  saved: boolean;
  discarded: boolean;
  isNew: boolean;
  onToggle: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { item } = r;
  const street = streetOf(item);
  const m2 = item.area_covered ?? item.area;
  const chips = r.reasons.slice(0, 4);
  return (
    <article className={open ? "bg-bg" : undefined}>
      <div className="flex items-start gap-3 px-3 py-4">
        <Photo src={item.photo} alt={street} className="size-20 shrink-0 md:size-24" />
        <button type="button" aria-expanded={open} onClick={onToggle} className="hit min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="idx text-[0.75rem] text-muted">{String(pos).padStart(2, "0")}</span>
            <TierPill tier={r.tier} score={r.score} />
            {isNew ? <span className="kicker text-signal">Nuevo</span> : null}
            {r.onAvenue ? <span className="kicker text-muted">Avenida</span> : null}
          </div>
          <h3 className="name mt-1 text-[1.0625rem] leading-snug text-title md:text-[1.1875rem]">{street}</h3>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            {item.zone || "CABA"} · {siteLabel(item.site)}
            {item.mirrors?.length ? ` y ${item.mirrors.map((m) => siteLabel(m.site)).join(", ")}` : ""} · {addedOn(item.first_seen)}
          </p>
          <p className="idx mt-2 text-[1.25rem] font-bold leading-none tracking-[-0.02em] text-title">
            USD {formatNum(item.price)}
            <span className="ml-2 text-[0.8125rem] font-normal text-muted">
              {m2 != null ? `${m2} m²${item.area_covered != null ? " cub." : ""}` : "sin m²"}
              {item.ambientes != null ? ` · ${item.ambientes} amb` : ""}
              {r.usdM2 != null ? ` · USD ${formatNum(r.usdM2)}/m²` : ""}
            </span>
          </p>
          {!open && (chips.length || r.flags.length) ? (
            <p className="mt-2 text-[0.8125rem] leading-snug">
              {chips.length ? <span className="text-ink">{chips.join(" · ")}</span> : null}
              {chips.length && r.flags.length ? <span className="text-muted"> — </span> : null}
              {r.flags.length ? <span className="text-muted">{r.flags.join(" · ")}</span> : null}
            </p>
          ) : null}
        </button>
        <Actions saved={saved} discarded={discarded} onSave={onSave} onDiscard={onDiscard} />
      </div>
      {open ? <Detail r={r} /> : null}
    </article>
  );
}

const STATE_COPY: Record<CheckState, { mark: string; word: string; cls: string }> = {
  si: { mark: "✓", word: "Confirmado", cls: "text-signal" },
  parcial: { mark: "~", word: "Parcial", cls: "text-title" },
  no: { mark: "✕", word: "No cumple", cls: "text-muted" },
  "?": { mark: "?", word: "A verificar", cls: "text-muted" },
};

function CheckRow({ c }: { c: Check }) {
  const s = STATE_COPY[c.state];
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 border-b border-line py-2.5 last:border-b-0">
      <span className={`idx text-center font-bold ${s.cls}`} aria-hidden>
        {s.mark}
      </span>
      <div>
        <p className="text-[0.9375rem] leading-snug text-title">
          {c.label} <span className="sr-only">: {s.word}</span>
        </p>
        <p className="text-[0.8125rem] leading-snug text-muted">{c.detail}</p>
      </div>
    </li>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const missing = value === "—";
  return (
    <div>
      <dt className="kicker text-muted">{label}</dt>
      <dd className={`idx mt-1 text-[1.25rem] font-bold leading-none tracking-[-0.02em] ${missing ? "text-muted" : "text-title"}`}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function Detail({ r }: { r: Ranked }) {
  const { item } = r;
  const street = streetOf(item);
  const desc = description(item);
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${item.zone || ""}, Ciudad de Buenos Aires`)}`;
  const confirmed = r.checks.filter((c) => c.state === "si").length;
  const partial = r.checks.filter((c) => c.state === "parcial").length;
  const open = r.checks.filter((c) => c.state === "?").length;
  return (
    <div className="border-t border-line px-3 py-5">
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          {item.photo ? (
            <Photo src={item.photo} alt={street} className="aspect-[4/3] w-full" />
          ) : (
            <p className="flex aspect-[4/3] items-end bg-photo p-3 text-muted">Este aviso no trae foto</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-5">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-solid">
              Abrir en {siteLabel(item.site)}
            </a>
            <a href={map} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              Ver en el mapa
            </a>
            {item.mirrors?.map((m) => (
              <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                También en {siteLabel(m.site)}
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <dl className="facts">
            <Fact label="Precio" value={`USD ${formatNum(item.price)}`} />
            <Fact
              label={item.area_covered != null ? "Cubiertos" : "Metros"}
              value={(item.area_covered ?? item.area) != null ? `${item.area_covered ?? item.area} m²` : "—"}
              hint={item.area_covered != null && item.area_total ? `${item.area_total} m² totales` : item.area_covered == null ? "Total, sin desglosar" : undefined}
            />
            <Fact label="USD por m²" value={r.usdM2 != null ? formatNum(r.usdM2) : "—"} />
            <Fact label="Ambientes" value={item.ambientes != null ? String(item.ambientes) : "—"} />
            <Fact label="Expensas" value={item.expensas_ars != null ? `$ ${formatNum(item.expensas_ars)}` : "—"} />
            <Fact label="Piso" value={item.piso != null ? (item.piso === 0 ? "PB" : String(item.piso)) : "—"} />
            <Fact label="Antigüedad" value={item.antiguedad_years != null ? `${item.antiguedad_years} años` : "—"} />
            <Fact label="Barrio" value={item.zone || "—"} />
          </dl>

          <div className="mt-6">
            <p className="kicker text-title">
              Lo que pidió Mailén · {confirmed} confirmados · {partial} {partial === 1 ? "parcial" : "parciales"} · {open} a verificar
            </p>
            <ul className="mt-2 border-t border-line">
              {r.checks.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </ul>
          </div>

          {r.reasons.length || r.flags.length ? (
            <p className="mt-5 text-[0.9375rem] leading-snug">
              {r.reasons.length ? <span className="text-title">Suma: {r.reasons.join(", ")}. </span> : null}
              {r.flags.length ? <span className="text-muted">Resta: {r.flags.join(", ")}.</span> : null}
            </p>
          ) : null}

          {desc ? <p className="measure mt-5 text-[0.9375rem] leading-relaxed text-ink">{desc}</p> : null}

          <div className="mt-6">
            <VisitPad id={item.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
