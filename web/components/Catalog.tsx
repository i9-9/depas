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

  const zones = zonesOf(listings);
  const pick = pickId ? listings.find((x) => x.id === pickId) ?? null : null;

  const visible = useMemo(() => {
    const max = Number(filters.maxPrice);
    const now = Date.now();
    const rows = listings.filter((item) => {
      if (pickId && item.id === pickId) return false;
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
  }, [listings, filters, sort, saved, discarded, pickId]);

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
      <p className="idx border-b border-ink py-3 text-[13px]">
        {visible.length + (pick ? 1 : 0)} en vista · {week} · {formatWhen(lastNovelty)}
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
            <option value="">Todos</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </Field>
        <Field label="USD máx." className="col-span-4 sm:col-span-2 lg:col-span-2">
          <Amount value={filters.maxPrice} placeholder="140.000" onChange={(v) => set("maxPrice", v)} />
        </Field>
        <Field label="Exp. máx." className="col-span-4 sm:col-span-2 lg:col-span-2">
          <Amount value={filters.maxExpensas} placeholder="s/d" onChange={(v) => set("maxExpensas", v)} />
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

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-ink py-2 text-[13px]">
        <Toggle on={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Nuevos" />
        <Toggle on={filters.onlyDrop} onChange={(v) => set("onlyDrop", v)} label="Bajó el precio" />
        <Toggle on={!filters.hideGone} onChange={(v) => set("hideGone", !v)} label="Dados de baja" />
        <Toggle on={filters.onlySaved} onChange={(v) => set("onlySaved", v)} label="Guardados" />
      </div>

      {!listings.length ? (
        <Empty
          title="Todavía no hay avisos"
          text="Cuando el buscador encuentre departamentos que pasen los filtros, van a aparecer acá."
        />
      ) : !visible.length && !pick ? (
        <Empty title="Nada con estos filtros" text="Probá ampliar barrio, precio o mostrar los dados de baja." />
      ) : (
        <Results
          items={visible}
          pick={pick}
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
  const ranks = new Map(items.map((item, i) => [item.id, i + 1]));
  const groups =
    sort === "tier"
      ? TIERS.map((tier) => ({
          tier,
          rows: items.filter((item) => listingTier(item.score || 0).id === tier.id),
        })).filter((g) => g.rows.length)
      : [{ tier: null, rows: items }];

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
        <span />
      </div>
      {pick && (
        <section>
          <h2 className="band flex items-center justify-between px-2 py-1.5 text-[12px] uppercase tracking-[0.16em]">
            <span>Candidato</span>
            <a href="/" className="normal-case tracking-normal text-[12px] text-bg/80 hover:text-bg">
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
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`min-h-9 border-b-2 ${on ? "border-accent text-ink" : "border-transparent text-ink/40"}`}
    >
      {label}
    </button>
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
    <div className="flex flex-col items-end gap-0 text-[11px] uppercase tracking-[0.12em] leading-none">
      <button
        type="button"
        onClick={onSave}
        aria-pressed={saved}
        aria-label={saved ? "Quitar de guardados" : "Guardar"}
        className={`min-h-6 ${saved ? "text-ink" : "text-ink/35"}`}
      >
        Ok
      </button>
      <button
        type="button"
        onClick={onDiscard}
        aria-pressed={discarded}
        aria-label={discarded ? "Volver a la lista" : "Descartar"}
        className={`min-h-6 ${discarded ? "text-accent" : "text-ink/35"}`}
      >
        No
      </button>
    </div>
  );
}

function Photo({ src }: { src: string }) {
  return (
    <div className="relative size-10 overflow-hidden bg-photo">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-[0.08em] text-ink/40">
          s/f
        </span>
      )}
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
  return (
    <article className={!item.active && !pinned ? "opacity-35" : ""}>
      <div className="tt grid py-1.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={tip}
          className="hit col-span-3 grid grid-cols-subgrid items-center md:col-span-8"
        >
          <p className="idx text-[11px] text-ink/45">{String(rank).padStart(2, "0")}</p>
          <Photo src={item.photo} />
          <div className="min-w-0">
            <h3 className="name truncate text-[14px] leading-tight">{street}</h3>
            <p className="truncate text-[11px] leading-tight text-ink/45">
              {marks.length ? `${marks.join(" · ")} · ` : ""}
              {siteLabel(item.site)}
            </p>
            <p className="idx mt-0.5 text-[16px] leading-none md:hidden">
              <PricePair item={item} inline />
              <span className="text-[12px] text-ink/45">
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
          <p className="idx hidden text-right text-[12px] text-ink/70 md:block">
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
