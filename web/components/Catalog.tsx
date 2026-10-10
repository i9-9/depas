"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TIERS,
  dropLine,
  fold,
  formatNum,
  formatWhen,
  hasDrop,
  isAlert,
  isNew,
  listingTier,
  publishedAgo,
  rankByScore,
  siteLabel,
  streetOf,
  zonesOf,
  type Listing,
} from "@/lib/listings";
import { FavoriteButton, StarIcon } from "@/components/FavoriteMark";
import { Photo } from "@/components/Photo";
import { PricePair } from "@/components/PricePair";
import { extraSpecsOf, specsCells } from "@/components/Specs";
import { Verdict } from "@/components/Verdict";
import { readPrefs, writePrefs } from "@/lib/storage";
import { airLine, joinEs, medianLine, seenLine } from "@/lib/verdict";

type SortKey = "tier" | "new" | "price-asc" | "price-desc" | "m2-asc" | "vs-median" | "air";

type Filters = {
  q: string;
  zone: string;
  site: string;
  ambientes: string;
  minArea: string;
  minPrice: string;
  maxPrice: string;
  maxExpensas: string;
  onlyNew: boolean;
  onlyDrop: boolean;
  onlyGone: boolean;
  onlySaved: boolean;
  onlyDiscarded: boolean;
  epoca: boolean;
  reciclar: boolean;
  cochera: boolean;
  pb: boolean;
  belowMedian: boolean;
};

const INITIAL: Filters = {
  q: "",
  zone: "",
  site: "",
  ambientes: "",
  minArea: "",
  minPrice: "",
  maxPrice: "",
  maxExpensas: "",
  onlyNew: false,
  onlyDrop: false,
  onlyGone: false,
  onlySaved: false,
  onlyDiscarded: false,
  epoca: false,
  reciclar: false,
  cochera: false,
  pb: false,
  belowMedian: false,
};

const SORTS: SortKey[] = ["tier", "new", "price-asc", "price-desc", "m2-asc", "vs-median", "air"];

function emptyCopy(filters: Filters): { title: string; text: string } {
  if (filters.onlyGone) {
    return {
      title: "Ninguno se dio de baja",
      text: "Cuando un aviso deje de aparecer en los portales, lo vas a ver acá.",
    };
  }
  if (filters.onlyDrop) {
    return {
      title: "Ninguno bajó el precio",
      text: "Cuando un aviso baje, lo vas a ver acá.",
    };
  }
  if (filters.onlySaved) {
    return {
      title: "No hay ninguno guardado",
      text: "Tocá la estrella en un aviso para verlo acá.",
    };
  }
  if (filters.onlyDiscarded) {
    return {
      title: "No hay ninguno sacado",
      text: "Los que marques con la cruz aparecen acá.",
    };
  }
  if (filters.onlyNew) {
    return {
      title: "Ninguno es nuevo",
      text: "Cuando salga uno que no estaba, lo vas a ver acá.",
    };
  }
  return {
    title: "No hay ninguno así",
    text: "Probá sacar un filtro, o mirá solo los que guardaste.",
  };
}

function extraLabel(filters: Filters, sort: SortKey): string | null {
  const bits: string[] = [];
  if (filters.zone) bits.push(filters.zone);
  if (filters.site) bits.push(siteLabel(filters.site));
  if (filters.ambientes) bits.push(`${filters.ambientes} amb.`);
  if (filters.minArea) bits.push(`desde ${filters.minArea} m²`);
  if (filters.minPrice || filters.maxPrice) bits.push("precio");
  if (filters.maxExpensas) bits.push("expensas");
  if (filters.epoca) bits.push("de época");
  if (filters.reciclar) bits.push("reciclar");
  if (filters.cochera) bits.push("cochera");
  if (filters.pb) bits.push("planta baja");
  if (filters.belowMedian) bits.push("más barato que el barrio");
  if (sort === "new") bits.push("más nuevos");
  if (sort === "price-asc") bits.push("más barato");
  if (sort === "price-desc") bits.push("más caro");
  if (sort === "m2-asc") bits.push("metro más barato");
  if (sort === "vs-median") bits.push("más barato que el barrio");
  if (sort === "air") bits.push("más aire");
  return bits.length ? bits.join(" · ") : null;
}

function readQuery(): { filters: Filters; sort: SortKey; openId: string | null } {
  if (typeof window === "undefined") return { filters: { ...INITIAL }, sort: "tier", openId: null };
  const p = new URLSearchParams(window.location.search);
  const flag = (key: string) => p.get(key) === "1";
  const orden = p.get("orden");
  return {
    openId: p.get("d"),
    filters: {
      ...INITIAL,
      q: p.get("q") ?? "",
      zone: p.get("zona") ?? "",
      site: p.get("portal") ?? "",
      ambientes: p.get("amb") ?? "",
      minArea: p.get("m2") ?? "",
      minPrice: p.get("min") ?? "",
      maxPrice: p.get("max") ?? "",
      maxExpensas: p.get("exp") ?? "",
      onlyNew: flag("nuevos"),
      onlyDrop: flag("bajo"),
      onlyGone: flag("dados"),
      onlySaved: flag("fav"),
      onlyDiscarded: flag("sacados"),
      epoca: flag("epoca"),
      reciclar: flag("reciclar"),
      cochera: flag("cochera"),
      pb: flag("pb"),
      belowMedian: flag("mediana"),
    },
    sort: orden && SORTS.includes(orden as SortKey) ? (orden as SortKey) : "tier",
  };
}

function writeQuery(filters: Filters, sort: SortKey, openId: string | null) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.zone) p.set("zona", filters.zone);
  if (filters.site) p.set("portal", filters.site);
  if (filters.ambientes) p.set("amb", filters.ambientes);
  if (filters.minArea) p.set("m2", filters.minArea);
  if (filters.minPrice) p.set("min", filters.minPrice);
  if (filters.maxPrice) p.set("max", filters.maxPrice);
  if (filters.maxExpensas) p.set("exp", filters.maxExpensas);
  if (filters.onlyNew) p.set("nuevos", "1");
  if (filters.onlyDrop) p.set("bajo", "1");
  if (filters.onlyGone) p.set("dados", "1");
  if (filters.onlySaved) p.set("fav", "1");
  if (filters.onlyDiscarded) p.set("sacados", "1");
  if (filters.epoca) p.set("epoca", "1");
  if (filters.reciclar) p.set("reciclar", "1");
  if (filters.cochera) p.set("cochera", "1");
  if (filters.pb) p.set("pb", "1");
  if (filters.belowMedian) p.set("mediana", "1");
  if (sort !== "tier") p.set("orden", sort);
  if (openId) p.set("d", openId);
  const qs = p.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}

function idsOf(item: Listing): string[] {
  return item.ids?.length ? item.ids : [item.id];
}

function isMarked(item: Listing, bag: string[]): boolean {
  return idsOf(item).some((id) => bag.includes(id));
}

function isOpen(item: Listing, openId: string | null): boolean {
  return Boolean(openId && idsOf(item).includes(openId));
}

function passesFilters(
  item: Listing,
  filters: Filters,
  saved: string[],
  discarded: string[],
): boolean {
  if (filters.onlyDiscarded) {
    if (!isMarked(item, discarded)) return false;
  } else if (isMarked(item, discarded)) {
    return false;
  }
  if (filters.onlySaved && !isMarked(item, saved)) return false;
  if (filters.onlyGone ? item.active : !item.active) return false;
  if (filters.zone && item.zone !== filters.zone) return false;
  if (filters.site && item.site !== filters.site && !item.mirrors.some((m) => m.site === filters.site)) {
    return false;
  }
  if (filters.ambientes && String(item.ambientes ?? "") !== filters.ambientes) return false;
  if (filters.minArea) {
    const min = Number(filters.minArea);
    if (item.area == null || item.area < min) return false;
  }
  if (filters.minPrice) {
    const min = Number(filters.minPrice);
    if (item.price == null || item.price < min) return false;
  }
  if (filters.maxPrice) {
    const max = Number(filters.maxPrice);
    if (item.price == null || item.price > max) return false;
  }
  if (filters.maxExpensas && item.expensas_ars != null) {
    if (item.expensas_ars > Number(filters.maxExpensas)) return false;
  }
  if (filters.onlyNew && !isNew(item)) return false;
  if (filters.onlyDrop && !hasDrop(item)) return false;
  if (filters.epoca && !(item.tags || []).some((t) => /época|epoca/.test(t))) return false;
  if (filters.reciclar && !(item.tags || []).some((t) => /reciclar/.test(t))) return false;
  if (filters.cochera && item.cochera !== true) return false;
  if (filters.pb && item.piso !== 0) return false;
  if (filters.belowMedian && (item.vs_median_pct == null || item.vs_median_pct >= 0)) return false;
  const q = fold(filters.q).trim();
  if (q) {
    const hay = fold(`${item.address} ${streetOf(item)} ${item.zone}`);
    if (!hay.includes(q)) return false;
  }
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
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = readQuery();
    setFilters(fromUrl.filters);
    setSort(fromUrl.sort);
    setOpenId(fromUrl.openId);
    const prefs = readPrefs();
    setSaved(prefs.saved);
    setDiscarded(prefs.discarded);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writePrefs({ saved, discarded });
  }, [saved, discarded, ready]);

  useEffect(() => {
    if (!ready) return;
    writeQuery(filters, sort, openId);
  }, [filters, sort, openId, ready]);

  useEffect(() => {
    if (!ready || discarded.length || !filters.onlyDiscarded) return;
    setFilters((f) => (f.onlyDiscarded ? { ...f, onlyDiscarded: false } : f));
  }, [discarded.length, filters.onlyDiscarded, ready]);

  const zones = zonesOf(listings);
  const sites = useMemo(() => {
    const seen = new Set<string>();
    for (const x of listings) {
      if (x.site) seen.add(x.site);
      for (const m of x.mirrors || []) seen.add(m.site);
    }
    return (["zonaprop", "argenprop", "mercadolibre"] as const).filter((s) => seen.has(s));
  }, [listings]);
  const pick = pickId
    ? listings.find((x) => x.id === pickId || x.ids.includes(pickId)) ?? null
    : null;
  const pickShown = Boolean(pick && ready && passesFilters(pick, filters, saved, discarded));

  const visible = useMemo(() => {
    if (!ready) return [];
    const rows = listings.filter((item) => {
      if (pickId && (item.id === pickId || item.ids.includes(pickId))) return false;
      return passesFilters(item, filters, saved, discarded);
    });
    rows.sort((a, b) => {
      if (sort === "price-asc") return (a.price ?? 1e12) - (b.price ?? 1e12);
      if (sort === "price-desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "m2-asc") return (a.usd_per_m2 ?? 1e12) - (b.usd_per_m2 ?? 1e12);
      if (sort === "vs-median") return (a.vs_median_pct ?? 1e12) - (b.vs_median_pct ?? 1e12);
      if (sort === "air") return (b.air_usd ?? -1e12) - (a.air_usd ?? -1e12);
      if (sort === "tier") return rankByScore(a, b);
      return Date.parse(b.first_seen || "") - Date.parse(a.first_seen || "");
    });
    return rows;
  }, [listings, filters, sort, saved, discarded, pickId, ready]);

  const shown = visible.length + (pickShown ? 1 : 0);
  const extras = extraLabel(filters, sort);

  useEffect(() => {
    if (!ready || !openId) return;
    const still =
      (pickShown && pick && isOpen(pick, openId)) ||
      visible.some((item) => isOpen(item, openId));
    if (!still) setOpenId(null);
  }, [ready, openId, visible, pick, pickShown]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "onlyDiscarded" && value) next.onlySaved = false;
      if (key === "onlySaved" && value) next.onlyDiscarded = false;
      return next;
    });
  }

  const anyNew = listings.some((item) => isNew(item));
  const seedDump =
    filters.onlyNew &&
    shown > 0 &&
    listings.filter((item) => item.active && !isMarked(item, discarded)).every((item) => isNew(item));

  function clusterIds(id: string): string[] {
    const item = listings.find((x) => x.id === id || x.ids.includes(id));
    return item ? idsOf(item) : [id];
  }

  function toggleSave(id: string) {
    const ids = clusterIds(id);
    setSaved((prev) => {
      const on = ids.some((x) => prev.includes(x));
      const next = on ? prev.filter((x) => !ids.includes(x)) : [...prev, ...ids];
      setNote(on ? "Sacado de guardados." : "Guardado para después.");
      return next;
    });
    setDiscarded((prev) => prev.filter((x) => !ids.includes(x)));
  }

  function toggleDiscard(id: string) {
    const ids = clusterIds(id);
    setDiscarded((prev) => {
      const on = ids.some((x) => prev.includes(x));
      const next = on ? prev.filter((x) => !ids.includes(x)) : [...prev, ...ids];
      setNote(on ? "Volvió a la lista." : "Sacado de la lista.");
      return next;
    });
    setSaved((prev) => prev.filter((x) => !ids.includes(x)));
  }

  return (
    <div>
      <h1 className="sr-only">Todos los departamentos</h1>
      {lastNovelty ? (
        <p className="sr-only">Lista revisada {formatWhen(lastNovelty)}</p>
      ) : null}

      <div className="border-b border-line">
        <label className="block">
          <span className="sr-only">Buscar calle</span>
          <input
            className="input w-full"
            type="search"
            placeholder="Buscar calle"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-x-5">
          <div className="flex flex-wrap gap-x-5">
            <Toggle
              on={filters.onlySaved}
              onChange={(v) => set("onlySaved", v)}
              label="Guardados"
              icon
            />
            <Toggle on={filters.onlyDrop} onChange={(v) => set("onlyDrop", v)} label="Bajó el precio" />
            {anyNew ? (
              <Toggle on={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Nuevos" />
            ) : null}
            <Toggle on={filters.onlyGone} onChange={(v) => set("onlyGone", v)} label="Ya no están" />
            {discarded.length > 0 ? (
              <Toggle
                on={filters.onlyDiscarded}
                onChange={(v) => set("onlyDiscarded", v)}
                label="Sacados"
              />
            ) : null}
          </div>
          <p aria-live="polite" aria-atomic="true" className="idx kicker text-muted">
            {ready ? shown : "…"}
          </p>
        </div>
        <details>
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center border-b-2 [&::-webkit-details-marker]:hidden ${
              extras ? "border-accent text-title" : "border-transparent text-ink"
            }`}
          >
            {extras ? `Más filtros · ${extras}` : "Más filtros"}
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
      </div>

      <p aria-live="polite" className={note ? "kicker py-2 text-muted" : "sr-only"}>
        {note}
      </p>
      {seedDump ? (
        <p className="kicker py-2 text-muted">Están todos: la lista arrancó hoy.</p>
      ) : null}

      {!ready ? (
        <p className="py-16 text-[14px] text-ink">Cargando tu lista…</p>
      ) : !listings.length ? (
        <Empty
          title="Todavía no hay departamentos"
          text="Cuando aparezcan, los vas a ver acá."
        />
      ) : !shown ? (
        <Empty {...emptyCopy(filters)} />
      ) : (
        <Results
          items={visible}
          pick={pickShown ? pick : null}
          sort={sort}
          saved={saved}
          discarded={discarded}
          openId={openId}
          onOpen={setOpenId}
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
    <div className="g pb-4 pt-2">
      <Field label="Barrio" className="col-span-6 lg:col-span-4">
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
        <Field label="Dónde está" className="col-span-6 lg:col-span-4">
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
      <Field label="Ambientes" className="col-span-6 lg:col-span-4">
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
      <Field label="Desde m²" className="col-span-6 lg:col-span-4">
        <Amount value={filters.minArea} placeholder="Mínimo" onChange={(v) => onFilter("minArea", v)} />
      </Field>
      <Field label="Desde USD" className="col-span-6 lg:col-span-4">
        <Amount value={filters.minPrice} placeholder="Mínimo" onChange={(v) => onFilter("minPrice", v)} />
      </Field>
      <Field label="Hasta USD" className="col-span-6 lg:col-span-4">
        <Amount value={filters.maxPrice} placeholder="Máximo" onChange={(v) => onFilter("maxPrice", v)} />
      </Field>
      <Field label="Expensas hasta" className="col-span-6 lg:col-span-4">
        <Amount value={filters.maxExpensas} placeholder="Máximo" onChange={(v) => onFilter("maxExpensas", v)} />
      </Field>
      <Field label="Orden" className="col-span-12 lg:col-span-4">
        <select className="input" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
          <option value="tier">Los que más encajan</option>
          <option value="new">Los más nuevos</option>
          <option value="price-asc">El más barato</option>
          <option value="price-desc">El más caro</option>
          <option value="m2-asc">El metro más barato</option>
          <option value="vs-median">Más barato que el barrio</option>
          <option value="air">El que más aire tiene</option>
        </select>
      </Field>
      <div className="col-span-12 flex flex-wrap items-end gap-x-5 lg:col-span-8">
        <Toggle on={filters.epoca} onChange={(v) => onFilter("epoca", v)} label="De época" />
        <Toggle on={filters.reciclar} onChange={(v) => onFilter("reciclar", v)} label="Reciclar" />
        <Toggle on={filters.cochera} onChange={(v) => onFilter("cochera", v)} label="Cochera" />
        <Toggle on={filters.pb} onChange={(v) => onFilter("pb", v)} label="Planta baja" />
        <Toggle on={filters.belowMedian} onChange={(v) => onFilter("belowMedian", v)} label="Más barato que el barrio" />
      </div>
    </div>
  );
}

function Results({
  items,
  pick,
  sort,
  saved,
  discarded,
  openId,
  onOpen,
  onSave,
  onDiscard,
}: {
  items: Listing[];
  pick: Listing | null;
  sort: SortKey;
  saved: string[];
  discarded: string[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  onSave: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const hoy = items.filter(isAlert).sort(rankByScore);
  const rest = items.filter((item) => !hoy.some((h) => h.id === item.id));
  const offset = pick ? 1 : 0;
  const groups =
    sort === "tier"
      ? TIERS.map((tier) => ({
          tier,
          rows: rest.filter((item) => listingTier(item.score || 0).id === tier.id),
        })).filter((g) => g.rows.length)
      : [{ tier: null, rows: rest }];

  let n = offset + hoy.length;
  const ranks = new Map<string, number>();
  for (const group of groups) {
    for (const item of group.rows) {
      n += 1;
      ranks.set(item.id, n);
    }
  }

  return (
    <div className="card mt-2 overflow-hidden">
      <div className="tt sticky top-0 z-10 hidden border-b border-line bg-card px-3 py-2.5 text-muted md:grid">
        <span>Nº</span>
        <span />
        <span>Dirección</span>
        <span className="text-right">m²</span>
        <span className="text-right">Amb.</span>
        <span>Barrio</span>
        <span className="text-right">Precio</span>
        <span className="text-right">El m²</span>
        <span className="flex justify-end">
          <StarIcon on={false} size={14} />
        </span>
      </div>
      {pick && (
        <section>
          <h2 className="band flex items-center justify-between px-3 py-2.5">
            <span>El de ahora</span>
            <a href="/" className="link">
              Verlo
            </a>
          </h2>
          <ul>
            <li className="border-b border-line">
              <Row
                item={pick}
                rank={1}
                pinned
                open={isOpen(pick, openId)}
                saved={isMarked(pick, saved)}
                discarded={isMarked(pick, discarded)}
                onToggle={() => onOpen(isOpen(pick, openId) ? null : pick.id)}
                onSave={() => onSave(pick.id)}
                onDiscard={() => onDiscard(pick.id)}
              />
            </li>
          </ul>
        </section>
      )}
      {hoy.length > 0 && (
        <section>
          <h2 className="band flex items-center justify-between px-3 py-2.5">
            <span>También salieron ahora</span>
            <span className="text-muted">{hoy.length}</span>
          </h2>
          <ul>
            {hoy.map((item, i) => (
              <li key={item.id} className="border-b border-line">
                <Row
                  item={item}
                  rank={offset + i + 1}
                  open={isOpen(item, openId)}
                  saved={isMarked(item, saved)}
                  discarded={isMarked(item, discarded)}
                  onToggle={() => onOpen(isOpen(item, openId) ? null : item.id)}
                  onSave={() => onSave(item.id)}
                  onDiscard={() => onDiscard(item.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.map((group) => (
        <section key={group.tier?.id || "flat"}>
          {group.tier && (
            <h2 className="band flex items-center justify-between px-3 py-2.5">
              <span>{group.tier.label}</span>
              <span className="text-muted">{group.rows.length}</span>
            </h2>
          )}
          <ul>
            {group.rows.map((item) => (
              <li key={item.id} className="border-b border-line last:border-b-0">
                <Row
                  item={item}
                  rank={ranks.get(item.id) || 0}
                  open={isOpen(item, openId)}
                  saved={isMarked(item, saved)}
                  discarded={isMarked(item, discarded)}
                  onToggle={() => onOpen(isOpen(item, openId) ? null : item.id)}
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
      <span className="kicker block text-muted">{label}</span>
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
      className={`flex min-h-11 items-center gap-1.5 border-b-2 ${on ? "border-accent text-title" : "border-transparent text-ink"}`}
    >
      {icon ? <StarIcon on={on} size={16} /> : null}
      {label}
    </button>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-md py-16">
      <h2 className="display text-title">{title}</h2>
      <p className="measure mt-4 text-ink">{text}</p>
    </div>
  );
}

type Flag = { text: string; tone: "muted" | "signal" };

function flags(item: Listing): Flag[] {
  const out: Flag[] = [];
  if (isNew(item)) {
    const ago = publishedAgo(item.first_seen);
    out.push({
      text: ago ? `Lo vimos ${ago}` : "Lo vimos recién",
      tone: isAlert(item) ? "signal" : "muted",
    });
  } else {
    const days = item.days_seen;
    if (days === 1) out.push({ text: "desde ayer", tone: "muted" });
    else if (days != null && days > 1) out.push({ text: `hace ${days} días`, tone: "muted" });
  }
  if (hasDrop(item)) out.push({ text: dropLine(item, { short: true }) || "Bajó el precio", tone: "signal" });
  if (!item.active) out.push({ text: "Ya no está", tone: "muted" });
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
    <div className="flex flex-col items-center md:flex-col">
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

function whyTeaser(item: Listing): { entra: string; resta: string } {
  return {
    entra: joinEs(item.verdict?.entra || []),
    resta: joinEs(item.verdict?.resta || []),
  };
}

function Row({
  item,
  rank,
  pinned = false,
  open,
  saved,
  discarded,
  onToggle,
  onSave,
  onDiscard,
}: {
  item: Listing;
  rank: number;
  pinned?: boolean;
  open: boolean;
  saved: boolean;
  discarded: boolean;
  onToggle: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const marks = flags(item);
  const cells = specsCells(item);
  const street = streetOf(item);
  const tip = item.title && item.title !== street ? item.title : undefined;
  const gone = !item.active && !pinned;
  const why = whyTeaser(item);
  const meta = (
    <>
      {marks.map((mark, i) => (
        <span key={`${mark.text}-${i}`}>
          {i > 0 ? " · " : ""}
          <span className={mark.tone === "signal" ? "text-signal" : undefined}>{mark.text}</span>
        </span>
      ))}
      {marks.length ? " · " : ""}
      {siteLabel(item.site)}
      {item.mirrors.length
        ? ` · también ${item.mirrors.map((m) => siteLabel(m.site)).join(", ")}`
        : ""}
    </>
  );
  const teaser = !open && (why.entra || why.resta) && (
    <p className="mt-1 text-[0.8125rem] leading-snug md:truncate">
      {why.entra ? <span className="text-ink">{why.entra}</span> : null}
      {why.entra && why.resta ? ". " : null}
      {why.resta ? <span className="text-muted">{why.resta}</span> : null}
    </p>
  );
  return (
    <article className={open ? "bg-bg" : undefined}>
      <div className="flex items-start gap-3 px-3 py-4 md:hidden">
        <Photo src={item.photo} alt={street} className="size-16 shrink-0" />
        <button
          type="button"
          title={tip}
          aria-expanded={open}
          onClick={onToggle}
          className="hit min-w-0 flex-1 text-left"
        >
          <h3 className={`name text-[1.0625rem] leading-snug ${gone ? "text-muted" : "text-title"}`}>{street}</h3>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {meta}
            {cells.zone && cells.zone !== "—" ? ` · ${cells.zone}` : ""}
          </p>
          {teaser}
          <p className="idx mt-2 text-[1.25rem] leading-none">
            <PricePair item={item} inline />
            <span className="ml-2 text-[0.8125rem] text-muted">
              {cells.m2} m² · {cells.amb === "—" ? "sin ambientes" : `${cells.amb} ambientes`}
              {item.usd_per_m2 != null ? ` · USD ${formatNum(item.usd_per_m2)}/m²` : ""}
            </span>
          </p>
        </button>
        <Actions saved={saved} discarded={discarded} onSave={onSave} onDiscard={onDiscard} />
      </div>
      <div className="tt hidden px-3 py-3 md:grid">
        <button
          type="button"
          title={tip}
          aria-expanded={open}
          onClick={onToggle}
          className="hit col-span-3 grid grid-cols-subgrid items-center text-left md:col-span-8"
        >
          <p className="idx text-[0.75rem] text-muted">{String(rank).padStart(2, "0")}</p>
          <Photo src={item.photo} alt={street} className="size-12" />
          <div className="min-w-0">
            <h3 className={`name truncate text-[0.9375rem] leading-snug ${gone ? "text-muted" : "text-title"}`}>{street}</h3>
            <p className="mt-0.5 truncate text-[0.8125rem] leading-snug text-muted">{meta}</p>
            {teaser}
          </div>
          <p className="idx text-right text-muted">{cells.m2}</p>
          <p className="idx text-right text-muted">{cells.amb}</p>
          <p className="truncate text-muted">{cells.zone}</p>
          <p className="idx text-right text-[1.125rem] leading-none">
            <PricePair item={item} inline />
          </p>
          <p className="idx text-right text-muted">
            {item.usd_per_m2 != null ? formatNum(item.usd_per_m2) : "—"}
          </p>
        </button>
        <div className="col-span-1">
          <Actions saved={saved} discarded={discarded} onSave={onSave} onDiscard={onDiscard} />
        </div>
      </div>
      {open ? <RowDetail item={item} /> : null}
    </article>
  );
}

function RowDetail({ item }: { item: Listing }) {
  const extra = extraSpecsOf(item);
  const median = medianLine(item);
  const air = airLine(item);
  const seen = seenLine(item);
  const title = item.title && item.title !== streetOf(item) ? item.title : null;
  const photo = item.photo ? (
    <Photo src={item.photo} alt={streetOf(item)} className="aspect-[4/3] max-h-52 w-full md:max-h-none" />
  ) : (
    <p className="flex aspect-[4/3] max-h-52 items-end bg-photo p-3 text-muted md:max-h-none">
      Este aviso no trae foto
    </p>
  );
  const links = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-solid"
      >
        Abrir el aviso en {siteLabel(item.site)}
      </a>
      {item.mirrors.map((m) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
        >
          También en {siteLabel(m.site)}
          {m.price != null ? ` · USD ${m.price.toLocaleString("es-AR")}` : ""}
        </a>
      ))}
    </div>
  );
  const copy = (
    <div className="min-w-0 space-y-4">
      {title ? <p className="text-ink">{title}</p> : null}
      <Verdict data={item.verdict} stacked />
      {extra.length ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {extra.map((row) => (
            <div key={row.label}>
              <dt className="kicker text-muted">{row.label}</dt>
              <dd className="idx text-title">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="measure space-y-1 text-muted">
        {median ? <p>{median}</p> : null}
        {air ? <p>{air}</p> : null}
        {seen ? <p>{seen}</p> : null}
      </div>
      {links}
    </div>
  );
  return (
    <div className="space-y-5 border-t border-line px-3 py-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="hidden md:block">{photo}</div>
        {copy}
        <div className="md:hidden">{photo}</div>
      </div>
    </div>
  );
}
