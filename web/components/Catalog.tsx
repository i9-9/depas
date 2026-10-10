"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatUsd,
  formatWhen,
  hasDrop,
  isNew,
  siteLabel,
  zonesOf,
  type Listing,
} from "@/lib/listings";
import { readPrefs, toggleId, writePrefs } from "@/lib/storage";

type SortKey = "new" | "price-asc" | "price-desc" | "score";

type Filters = {
  zone: string;
  site: string;
  ambientes: string;
  maxPrice: string;
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
  onlyNew: false,
  onlyDrop: false,
  hideGone: true,
  onlySaved: false,
};

export function Catalog({
  listings,
  lastNovelty,
}: {
  listings: Listing[];
  lastNovelty: string | null;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [sort, setSort] = useState<SortKey>("new");
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
      if (filters.onlyNew && !isNew(item, now)) return false;
      if (filters.onlyDrop && !hasDrop(item)) return false;
      return true;
    });
    const ranked = [...rows];
    ranked.sort((a, b) => {
      if (sort === "price-asc") return (a.price ?? 1e12) - (b.price ?? 1e12);
      if (sort === "price-desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "score") return (b.score || 0) - (a.score || 0);
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
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Búsqueda privada
        </p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Departamentos
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          {activeCount} avisos activos
          <span aria-hidden="true"> · </span>
          última novedad: {formatWhen(lastNovelty)}
        </p>
      </header>

      <section
        aria-label="Filtros"
        className="mt-8 rounded-[var(--radius)] border border-line bg-elev/80 p-4 shadow-[var(--shadow)] backdrop-blur"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Barrio">
            <select
              className="input"
              value={filters.zone}
              onChange={(e) => set("zone", e.target.value)}
            >
              <option value="">Todos</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Portal">
            <select
              className="input"
              value={filters.site}
              onChange={(e) => set("site", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="zonaprop">Zonaprop</option>
              <option value="argenprop">Argenprop</option>
            </select>
          </Field>
          <Field label="Ambientes">
            <select
              className="input"
              value={filters.ambientes}
              onChange={(e) => set("ambientes", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </Field>
          <Field label="Precio máximo (USD)">
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
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <Check checked={filters.onlyNew} onChange={(v) => set("onlyNew", v)} label="Solo nuevos" />
          <Check checked={filters.onlyDrop} onChange={(v) => set("onlyDrop", v)} label="Solo baja de precio" />
          <Check checked={filters.hideGone} onChange={(v) => set("hideGone", v)} label="Ocultar dados de baja" />
          <Check checked={filters.onlySaved} onChange={(v) => set("onlySaved", v)} label="Guardados" />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-muted">
            Orden
            <select
              className="input w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="new">Más nuevos</option>
              <option value="price-asc">Precio ↑</option>
              <option value="price-desc">Precio ↓</option>
              <option value="score">Score</option>
            </select>
          </label>
          <p className="text-sm text-muted" aria-live="polite">
            {visible.length} resultado{visible.length === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {!listings.length ? (
        <Empty
          title="Todavía no hay avisos"
          text="Cuando el buscador encuentre departamentos que pasen los filtros, van a aparecer acá."
        />
      ) : !visible.length ? (
        <Empty
          title="Nada con estos filtros"
          text="Probá ampliar barrio, precio o mostrar los dados de baja."
        />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Card
                item={item}
                saved={saved.includes(item.id)}
                discarded={discarded.includes(item.id)}
                onSave={() => toggleSave(item.id)}
                onDiscard={() => toggleDiscard(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-[0.14em] text-muted">
      {label}
      <div className="mt-1.5">{children}</div>
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
    <label className="inline-flex cursor-pointer items-center gap-2 text-ink">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-16 rounded-[var(--radius)] border border-dashed border-line px-6 py-16 text-center">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
    </div>
  );
}

function Card({
  item,
  saved,
  discarded,
  onSave,
  onDiscard,
}: {
  item: Listing;
  saved: boolean;
  discarded: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const gone = !item.active;
  const drop = hasDrop(item);
  const fresh = isNew(item);
  const facts = [
    item.area != null ? `${item.area.toLocaleString("es-AR")} m²` : null,
    item.ambientes != null ? `${item.ambientes} amb` : null,
    item.zone || null,
  ].filter(Boolean);

  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-elev shadow-[var(--shadow)] ${
        gone ? "opacity-55" : ""
      }`}
    >
      <div className="relative aspect-[4/3] bg-photo">
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo}
            alt={item.title || item.address || "Departamento"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-between p-5">
            <p className="font-display text-5xl leading-none text-ink/20">
              {(item.zone || item.site || "·").slice(0, 1)}
            </p>
            <p className="text-sm text-muted">Sin foto en el listado</p>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {fresh && <Badge>Nuevo</Badge>}
          {drop && <Badge tone="warn">Bajó de precio</Badge>}
          {gone && <Badge tone="gone">Dado de baja</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="font-display text-3xl tracking-tight text-ink">{formatUsd(item.price)}</p>
          {drop && (
            <p className="text-sm text-muted">
              <span className="line-through">{formatUsd(item.old_price)}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-muted">{facts.join(" · ") || "Datos incompletos"}</p>
        <h2 className="font-display text-xl leading-snug text-ink">
          {item.title || item.address || "Aviso sin título"}
        </h2>
        {item.address && item.title && (
          <p className="text-sm text-muted">{item.address}</p>
        )}
        {!!item.tags.length && (
          <ul className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{siteLabel(item.site)}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-sm font-medium text-[var(--bg)]"
          >
            Ver aviso
          </a>
          <button
            type="button"
            onClick={onSave}
            aria-pressed={saved}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm"
          >
            {saved ? "Guardado" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            aria-pressed={discarded}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-muted"
          >
            {discarded ? "Descartado" : "Descartar"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Badge({
  children,
  tone = "ok",
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "gone";
}) {
  const color =
    tone === "warn" ? "bg-warn text-[var(--bg)]" : tone === "gone" ? "bg-gone text-[var(--bg)]" : "bg-ok text-[var(--bg)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{children}</span>
  );
}
