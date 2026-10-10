"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TIERS,
  dropLine,
  formatNum,
  formatWhen,
  hasDrop,
  isNew,
  listingTier,
  rankByScore,
  siteLabel,
  streetOf,
  zonesOf,
  type Listing,
} from "@/lib/listings";
import { FavoriteButton, StarIcon } from "@/components/FavoriteMark";
import { Photo } from "@/components/Photo";
import { PricePair } from "@/components/PricePair";
import { specsCells } from "@/components/Specs";
import { readPrefs, toggleId, writePrefs } from "@/lib/storage";

type SortKey = "tier" | "new" | "price-asc" | "price-desc";

type Filters = {
  zone: string;
  site: string;
  ambientes: string;
  maxPrice: string;
  maxExpensas: string;
  onlyNew: boolean;
  onlyDrop: boolean;
  hideGone: boolean;
  onlySaved: boolean;
};

const INITIAL: Filters = {
  zone: "",
  site: "",
  ambientes: "",
  maxPrice: "",
  maxExpensas: "",
  onlyNew: false,
  onlyDrop: false,
  hideGone: true,
  onlySaved: false,
};

function passesFilters(
  item: Listing,
  filters: Filters,
  saved: string[],
  discarded: string[],
): boolean {
  if (discarded.includes(item.id) && !filters.onlySaved) return false;
  if (filters.onlySaved && !saved.includes(item.id)) return false;
  if (filters.hideGone && !item.active) return false;
  if (filters.zone && item.zone !== filters.zone) return false;
  if (filters.site && item.site !== filters.site) return false;
  if (filters.ambientes && String(item.ambientes ?? "") !== filters.ambientes) return false;
  if (filters.maxPrice) {
    const max = Number(filters.maxPrice);
    if (item.price == null || item.price > max) return false;
  }
  if (filters.maxExpensas && item.expensas_ars != null) {
    if (item.expensas_ars > Number(filters.maxExpensas)) return false;
  }
  if (filters.onlyNew && !isNew(item)) return false;
  if (filters.onlyDrop && !hasDrop(item)) return false;
  return true;
}

export function Catalog({
  listings,
  lastNovelty,
  pickId = null,
}: {
  listings: Listing[];
  lastNovelty: string | null;
  pickId?: string | null;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [sort, setSort] = useState<SortKey>("tier");
  const [saved, setSaved] = useState<string[]>([]);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const prefs = readPrefs();
    setSaved(prefs.saved);
    setDiscarded(prefs.discarded);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writePrefs({ saved, discarded });
  }, [saved, discarded, ready]);

  const zones = zonesOf(listings);
  const sites = useMemo(() => {
    const seen = new Set(listings.map((x) => x.site).filter(Boolean));
    return (["zonaprop", "argenprop", "mercadolibre"] as const).filter((s) => seen.has(s));
  }, [listings]);
  const pick = pickId ? listings.find((x) => x.id === pickId) ?? null : null;
  const pickShown = Boolean(pick && ready && passesFilters(pick, filters, saved, discarded));

  const visible = useMemo(() => {
    if (!ready) return [];
    const rows = listings.filter((item) => {
      if (pickId && item.id === pickId) return false;
      return passesFilters(item, filters, saved, discarded);
    });
    rows.sort((a, b) => {
      if (sort === "price-asc") return (a.price ?? 1e12) - (b.price ?? 1e12);
      if (sort === "price-desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "tier") return rankByScore(a, b);
      return Date.parse(b.first_seen || "") - Date.parse(a.first_seen || "");
    });
    return rows;
  }, [listings, filters, sort, saved, discarded, pickId, ready]);

  const shown = visible.length + (pickShown ? 1 : 0);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleSave(id: string) {
    setSaved((prev) => {
      const next = toggleId(prev, id);
      setNote(next.includes(id) ? "Guardado en favoritos." : "Sacado de favoritos.");
      return next;
    });
    setDiscarded((prev) => prev.filter((x) => x !== id));
  }

  function toggleDiscard(id: string) {
    setDiscarded((prev) => {
      const next = toggleId(prev, id);
      setNote(next.includes(id) ? "Sacado de la lista." : "Volvió a la lista.");
      return next;
    });
    setSaved((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div>
      <h1 className="sr-only">Lista de departamentos</h1>
      <p className="idx border-b border-ink py-3 text-[13px]">
        {ready ? `${shown} ${shown === 1 ? "aviso" : "avisos"}` : "…"}
        {lastNovelty ? ` · actualizado ${formatWhen(lastNovelty)}` : ""}
      </p>
      <p className="border-b border-ink py-3 text-[13px] text-quiet">
        Marcá favoritos. Quedan en este teléfono.
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-ink py-1 text-[13px]">
        <Toggle
          on={filters.onlySaved}
          onChange={(v) => set("onlySaved", v)}
          label="Favoritos"
          icon
        />
        <Toggle on={filters.onlyDrop} onChange={(v) => set("onlyDrop", v)} label="Bajó el precio" />
        <Toggle on={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Nuevos" />
        <Toggle on={!filters.hideGone} onChange={(v) => set("hideGone", !v)} label="Dados de baja" />
      </div>

      <details className="border-b border-ink md:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center text-[13px]">
          Filtrar y ordenar
        </summary>
        <FilterFields
          filters={filters}
          sort={sort}
          zones={zones}
          sites={sites}
          onFilter={set}
          onSort={setSort}
        />
      </details>
      <div className="hidden border-b border-ink md:block">
        <FilterFields
          filters={filters}
          sort={sort}
          zones={zones}
          sites={sites}
          onFilter={set}
          onSort={setSort}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {note}
      </p>

      {!ready ? (
        <p className="py-16 text-[14px] text-quiet">Cargando tu lista…</p>
      ) : !listings.length ? (
        <Empty
          title="Todavía no hay avisos"
          text="Cuando el buscador encuentre departamentos, van a aparecer acá."
        />
      ) : !shown ? (
        <Empty
          title="Nada con estos filtros"
          text="Sacá algún filtro, o mirá solo favoritos."
        />
      ) : (
        <Results
          items={visible}
          pick={pickShown ? pick : null}
          sort={sort}
          saved={saved}
          discarded={discarded}
          onSave={toggleSave}
          onDiscard={toggleDiscard}
        />
      )}
    </div>
  );
}

function FilterFields({
  filters,
  sort,
  zones,
  sites,
  onFilter,
  onSort,
}: {
  filters: Filters;
  sort: SortKey;
  zones: string[];
  sites: string[];
  onFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onSort: (value: SortKey) => void;
}) {
  return (
    <div className="g py-4">
      <Field label="Barrio" className="col-span-6 sm:col-span-3 lg:col-span-2">
        <select className="input" value={filters.zone} onChange={(e) => onFilter("zone", e.target.value)}>
          <option value="">Todos</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>
      {sites.length > 1 ? (
        <Field label="Portal" className="col-span-6 sm:col-span-3 lg:col-span-2">
          <select className="input" value={filters.site} onChange={(e) => onFilter("site", e.target.value)}>
            <option value="">Todos</option>
            {sites.map((s) => (
              <option key={s} value={s}>
                {siteLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Ambientes" className="col-span-4 sm:col-span-2 lg:col-span-2">
        <select
          className="input"
          value={filters.ambientes}
          onChange={(e) => onFilter("ambientes", e.target.value)}
        >
          <option value="">Todos</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </Field>
      <Field label="Precio máximo" className="col-span-4 sm:col-span-2 lg:col-span-2">
        <Amount value={filters.maxPrice} placeholder="Hasta USD" onChange={(v) => onFilter("maxPrice", v)} />
      </Field>
      <Field label="Expensas máx." className="col-span-4 sm:col-span-2 lg:col-span-2">
        <Amount value={filters.maxExpensas} placeholder="Hasta $" onChange={(v) => onFilter("maxExpensas", v)} />
      </Field>
      <Field label="Orden" className="col-span-6 sm:col-span-3 lg:col-span-2">
        <select className="input" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
          <option value="tier">Mejor primero</option>
          <option value="new">Más nuevos</option>
          <option value="price-asc">Más barato</option>
          <option value="price-desc">Más caro</option>
        </select>
      </Field>
    </div>
  );
}

function Results({
  items,
  pick,
  sort,
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  items: Listing[];
  pick: Listing | null;
  sort: SortKey;
  saved: string[];
  discarded: string[];
  onSave: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const offset = pick ? 1 : 0;
  const groups =
    sort === "tier"
      ? TIERS.map((tier) => ({
          tier,
          rows: items.filter((item) => listingTier(item.score || 0).id === tier.id),
        })).filter((g) => g.rows.length)
      : [{ tier: null, rows: items }];

  let n = offset;
  const ranks = new Map<string, number>();
  for (const group of groups) {
    for (const item of group.rows) {
      n += 1;
      ranks.set(item.id, n);
    }
  }

  return (
    <div>
      <div className="tt sticky top-0 z-10 hidden border-b border-ink bg-bg py-2 text-[11px] uppercase tracking-[0.12em] md:grid">
        <span>Nr</span>
        <span />
        <span>Dirección</span>
        <span className="text-right">m²</span>
        <span className="text-right">Amb</span>
        <span>Barrio</span>
        <span className="text-right">USD</span>
        <span className="text-right">USD/m²</span>
        <span className="flex justify-end">
          <StarIcon on={false} size={14} />
        </span>
      </div>
      {pick && (
        <section>
          <h2 className="band flex items-center justify-between px-2 py-1.5 text-[12px] uppercase tracking-[0.16em]">
            <span>Candidato</span>
            <a href="/" className="normal-case tracking-normal text-[12px] text-bg">
              Ver ficha
            </a>
          </h2>
          <ul>
            <li className="border-b border-ink/20">
              <Row
                item={pick}
                rank={1}
                pinned
                saved={saved.includes(pick.id)}
                discarded={discarded.includes(pick.id)}
                onSave={() => onSave(pick.id)}
                onDiscard={() => onDiscard(pick.id)}
              />
            </li>
          </ul>
        </section>
      )}
      {groups.map((group) => (
        <section key={group.tier?.id || "flat"}>
          {group.tier && (
            <h2 className="band flex items-center justify-between px-2 py-1.5 text-[12px] uppercase tracking-[0.16em]">
              <span>{group.tier.label}</span>
              <span className="idx">{group.rows.length}</span>
            </h2>
          )}
          <ul>
            {group.rows.map((item) => (
              <li key={item.id} className="border-b border-ink/20">
                <Row
                  item={item}
                  rank={ranks.get(item.id) || 0}
                  saved={saved.includes(item.id)}
                  discarded={discarded.includes(item.id)}
                  onSave={() => onSave(item.id)}
                  onDiscard={() => onDiscard(item.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="block text-[11px] uppercase tracking-[0.14em]">{label}</span>
      {children}
    </label>
  );
}

function Amount({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const shown = value ? Number(value).toLocaleString("es-AR") : "";
  return (
    <input
      className="input idx"
      inputMode="numeric"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
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
      className={`flex min-h-11 items-center gap-1.5 border-b-2 ${on ? "border-accent text-ink" : "border-transparent text-quiet"}`}
    >
      {icon ? <StarIcon on={on} size={16} /> : null}
      {label}
    </button>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-md py-16">
      <h2 className="display text-[32px]">{title}</h2>
      <p className="mt-4 text-[14px] text-quiet">{text}</p>
    </div>
  );
}

function flags(item: Listing): string[] {
  const out: string[] = [];
  if (!isNew(item)) {
    const days = item.days_seen;
    if (days === 1) out.push("ayer");
    else if (days != null && days > 1) out.push(`hace ${days} d`);
  }
  if (hasDrop(item)) out.push(dropLine(item, { short: true }) || "Bajó");
  if (!item.active) out.push("Dado de baja");
  return out;
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
      <FavoriteButton on={saved} onClick={onSave} />
      <button
        type="button"
        onClick={onDiscard}
        aria-pressed={discarded}
        aria-label={discarded ? "Volver a la lista" : "Sacar de la lista"}
        className={`grid size-10 place-items-center ${discarded ? "text-accent" : "text-quiet"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}

function Row({
  item,
  rank,
  pinned = false,
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  item: Listing;
  rank: number;
  pinned?: boolean;
  saved: boolean;
  discarded: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const marks = flags(item);
  const cells = specsCells(item);
  const street = streetOf(item);
  const tip = item.title && item.title !== street ? item.title : undefined;
  const gone = !item.active && !pinned;
  return (
    <article>
      <div className="tt grid py-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={tip}
          className="hit col-span-3 grid grid-cols-subgrid items-center md:col-span-8"
        >
          <p className="idx text-[11px] text-quiet">{String(rank).padStart(2, "0")}</p>
          <Photo src={item.photo} alt={street} className="size-12" />
          <div className="min-w-0">
            <h3 className={`name truncate text-[14px] leading-tight ${gone ? "text-quiet" : ""}`}>{street}</h3>
            <p className="truncate text-[11px] leading-tight text-quiet">
              {marks.length ? `${marks.join(" · ")} · ` : ""}
              {siteLabel(item.site)}
            </p>
            <p className="idx mt-0.5 text-[16px] leading-none md:hidden">
              <PricePair item={item} inline />
              <span className="text-[12px] text-quiet">
                {" "}
                · {cells.m2} · {cells.amb} · {item.usd_per_m2 != null ? formatNum(item.usd_per_m2) : "s/d"}/m²
              </span>
            </p>
          </div>
          <p className="idx hidden text-right text-[12px] md:block">{cells.m2}</p>
          <p className="idx hidden text-right text-[12px] md:block">{cells.amb}</p>
          <p className="hidden truncate text-[12px] md:block">{cells.zone}</p>
          <p className="idx hidden text-right text-[18px] leading-none md:block">
            <PricePair item={item} inline />
          </p>
          <p className="idx hidden text-right text-[12px] text-quiet md:block">
            {item.usd_per_m2 != null ? formatNum(item.usd_per_m2) : "s/d"}
          </p>
        </a>
        <div className="col-span-1">
          <Actions saved={saved} discarded={discarded} onSave={onSave} onDiscard={onDiscard} />
        </div>
      </div>
    </article>
  );
}
