"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TIERS,
  dropLine,
  formatWhen,
  hasDrop,
  inIsoWeek,
  isNew,
  listingTier,
  rankByScore,
  siteLabel,
  zonesOf,
  type Listing,
} from "@/lib/listings";
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

export function Catalog({
  listings,
  lastNovelty,
  week,
  pickId = null,
}: {
  listings: Listing[];
  lastNovelty: string | null;
  week: string;
  pickId?: string | null;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [sort, setSort] = useState<SortKey>("tier");
  const [saved, setSaved] = useState<string[]>([]);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

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

  const activeCount = listings.filter((x) => x.active).length;
  const zones = zonesOf(listings);

  const visible = useMemo(() => {
    const max = Number(filters.maxPrice);
    const now = Date.now();
    const rows = listings.filter((item) => {
      if (discarded.includes(item.id) && !filters.onlySaved) return false;
      if (filters.onlySaved && !saved.includes(item.id)) return false;
      if (filters.hideGone && !item.active) return false;
      if (filters.zone && item.zone !== filters.zone) return false;
      if (filters.site && item.site !== filters.site) return false;
      if (filters.ambientes && String(item.ambientes ?? "") !== filters.ambientes) return false;
      if (filters.maxPrice && (item.price == null || item.price > max)) return false;
      const maxE = Number(filters.maxExpensas);
      if (filters.maxExpensas && item.expensas_ars != null && item.expensas_ars > maxE) return false;
      if (filters.onlyNew && !isNew(item, now)) return false;
      if (filters.onlyDrop && !hasDrop(item)) return false;
      return true;
    });
    const ranked = [...rows];
    ranked.sort((a, b) => {
      if (sort === "price-asc") return (a.price ?? 1e12) - (b.price ?? 1e12);
      if (sort === "price-desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "tier") return rankByScore(a, b);
      return Date.parse(b.first_seen || "") - Date.parse(a.first_seen || "");
    });
    return ranked;
  }, [listings, filters, sort, saved, discarded]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleSave(id: string) {
    setSaved((prev) => toggleId(prev, id));
    setDiscarded((prev) => prev.filter((x) => x !== id));
  }

  function toggleDiscard(id: string) {
    setDiscarded((prev) => toggleId(prev, id));
    setSaved((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div>
      <h1 className="sr-only">Archivo</h1>
      <p className="idx border-b border-ink py-4 text-[13px]">
        {activeCount} activos · {week} · {formatWhen(lastNovelty)} · {visible.length} en vista
      </p>

      <div className="g border-b border-ink py-4">
        <Field label="Barrio" className="col-span-6 sm:col-span-3 lg:col-span-2">
          <select className="input" value={filters.zone} onChange={(e) => set("zone", e.target.value)}>
            <option value="">Todos</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Portal" className="col-span-6 sm:col-span-3 lg:col-span-2">
          <select className="input" value={filters.site} onChange={(e) => set("site", e.target.value)}>
            <option value="">Todos</option>
            <option value="zonaprop">Zonaprop</option>
            <option value="argenprop">Argenprop</option>
            <option value="mercadolibre">Mercado Libre</option>
          </select>
        </Field>
        <Field label="Amb" className="col-span-4 sm:col-span-2 lg:col-span-1">
          <select className="input" value={filters.ambientes} onChange={(e) => set("ambientes", e.target.value)}>
            <option value="">—</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </Field>
        <Field label="USD máx." className="col-span-4 sm:col-span-2 lg:col-span-2">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="140000"
            value={filters.maxPrice}
            onChange={(e) => set("maxPrice", e.target.value)}
          />
        </Field>
        <Field label="Exp. máx." className="col-span-4 sm:col-span-2 lg:col-span-2">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="—"
            value={filters.maxExpensas}
            onChange={(e) => set("maxExpensas", e.target.value)}
          />
        </Field>
        <Field label="Orden" className="col-span-6 sm:col-span-3 lg:col-span-3">
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="tier">Tiers</option>
            <option value="new">Más nuevos</option>
            <option value="price-asc">Precio ↑</option>
            <option value="price-desc">Precio ↓</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-ink py-3 text-[13px]">
        <Check checked={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Nuevos" />
        <Check checked={filters.onlyDrop} onChange={(v) => set("onlyDrop", v)} label="Baja de precio" />
        <Check checked={filters.hideGone} onChange={(v) => set("hideGone", v)} label="Ocultar bajas" />
        <Check checked={filters.onlySaved} onChange={(v) => set("onlySaved", v)} label="Guardados" />
      </div>

      {!listings.length ? (
        <Empty
          title="Todavía no hay avisos"
          text="Cuando el buscador encuentre departamentos que pasen los filtros, van a aparecer acá."
        />
      ) : !visible.length ? (
        <Empty title="Nada con estos filtros" text="Probá ampliar barrio, precio o mostrar los dados de baja." />
      ) : (
        <Results
          items={visible}
          sort={sort}
          week={week}
          pickId={pickId}
          saved={saved}
          discarded={discarded}
          onSave={toggleSave}
          onDiscard={toggleDiscard}
        />
      )}
    </div>
  );
}

function Results({
  items,
  sort,
  week,
  pickId,
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  items: Listing[];
  sort: SortKey;
  week: string;
  pickId: string | null;
  saved: string[];
  discarded: string[];
  onSave: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const ranks = new Map(items.map((item, i) => [item.id, i + 1]));
  const groups =
    sort === "tier"
      ? TIERS.map((tier) => ({
          tier,
          rows: items.filter((item) => listingTier(item.score || 0).id === tier.id),
        })).filter((g) => g.rows.length)
      : [{ tier: null, rows: items }];

  return (
    <div className="mt-0">
      {groups.map((group) => (
        <section key={group.tier?.id || "flat"}>
          {group.tier && (
            <h2 className="band mt-0 flex items-center justify-between px-2 py-2 text-[13px] uppercase tracking-[0.16em]">
              <span>{group.tier.label}</span>
              <span className="idx">{group.rows.length}</span>
            </h2>
          )}
          <div className="hidden border-b border-ink text-[11px] uppercase tracking-[0.12em] md:grid md:grid-cols-[40px_48px_minmax(0,1fr)_56px_40px_120px_88px_88px] md:gap-3 md:py-2">
            <span>Nr</span>
            <span />
            <span>Dirección</span>
            <span className="text-right">m²</span>
            <span className="text-right">Amb</span>
            <span>Barrio</span>
            <span className="text-right">USD</span>
            <span />
          </div>
          <ul>
            {group.rows.map((item) => (
              <li key={item.id} className="border-b border-ink/25">
                <Row
                  item={item}
                  rank={ranks.get(item.id) || 0}
                  week={week}
                  isPick={item.id === pickId}
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

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        className="size-4 accent-[var(--ink)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-md py-16">
      <h2 className="display text-[32px]">{title}</h2>
      <p className="mt-4 text-[14px]">{text}</p>
    </div>
  );
}

function flags(item: Listing, week: string, isPick: boolean): string[] {
  const out: string[] = [];
  if (isPick) out.push("Candidato");
  if (isNew(item)) out.push("Nuevo");
  else if (inIsoWeek(item.first_seen, week)) out.push("Esta semana");
  if (hasDrop(item)) out.push(dropLine(item, { short: true }) || "Bajó");
  if (!item.active) out.push("Baja");
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
    <div className="flex gap-3 text-[11px] uppercase tracking-[0.12em]">
      <button type="button" onClick={onSave} aria-pressed={saved} className="min-h-10">
        {saved ? "Ok" : "Guardar"}
      </button>
      <button type="button" onClick={onDiscard} aria-pressed={discarded} className={`min-h-10 ${discarded ? "text-accent" : "text-ink/40"}`}>
        {discarded ? "Fuera" : "Descartar"}
      </button>
    </div>
  );
}

function Row({
  item,
  rank,
  week,
  isPick,
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  item: Listing;
  rank: number;
  week: string;
  isPick: boolean;
  saved: boolean;
  discarded: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const marks = flags(item, week, isPick);
  const cells = specsCells(item);
  return (
    <article className={!item.active ? "opacity-35" : ""}>
      <div className="grid grid-cols-[32px_48px_minmax(0,1fr)] items-center gap-3 py-3 md:grid-cols-[40px_48px_minmax(0,1fr)_56px_40px_120px_88px_88px]">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hit col-span-3 grid grid-cols-subgrid items-center gap-3 md:col-span-7"
        >
          <p className="idx text-[12px] text-ink/50">{String(rank).padStart(2, "0")}</p>
          <div className="size-12 bg-photo">
            {item.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <h3 className="name truncate text-[16px]">
              {item.address || item.title || "Aviso sin dirección"}
            </h3>
            <p className="truncate text-[11px] text-ink/50">
              {marks.length ? `${marks.join(" · ")} · ` : ""}
              {siteLabel(item.site)}
            </p>
            <p className="mt-1 text-[14px] md:hidden">
              <PricePair item={item} inline />
              <span className="text-ink/50">
                {" "}
                · {cells.m2} · {cells.amb} · {cells.zone}
              </span>
            </p>
          </div>
          <p className="idx hidden text-right md:block">{cells.m2}</p>
          <p className="idx hidden text-right md:block">{cells.amb}</p>
          <p className="hidden truncate md:block">{cells.zone}</p>
          <p className="idx hidden text-right md:block">
            <PricePair item={item} inline />
          </p>
        </a>
        <div className="col-span-3 md:col-span-1">
          <Actions saved={saved} discarded={discarded} onSave={onSave} onDiscard={onDiscard} />
        </div>
      </div>
    </article>
  );
}
