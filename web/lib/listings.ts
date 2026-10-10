import argenprop from "../data/listings-argenprop.json";
import zonaprop from "../data/listings-zonaprop.json";

export type PricePoint = {
  date: string | null;
  price: number | null;
};

export type Listing = {
  id: string;
  site: "zonaprop" | "argenprop" | string;
  url: string;
  title: string;
  address: string;
  zone: string;
  price: number | null;
  old_price: number | null;
  price_history: PricePoint[];
  area: number | null;
  ambientes: number | null;
  photo: string;
  tags: string[];
  score: number;
  first_seen: string | null;
  active: boolean;
  gone_at: string | null;
  usd_per_m2: number | null;
  vs_median_pct: number | null;
  vs_median_n: number | null;
  days_seen: number | null;
  price_drops: number;
  closing_ref_usd: number | null;
  expensas_ars: number | null;
  expensas_text: string;
  antiguedad_years: number | null;
  piso: number | null;
  cochera: boolean | null;
};

export const CLOSING_DISCOUNT_PCT = 5;
export const MEDIAN_MIN_N = 8;

type RawListing = Partial<Listing> & { id: string };

export type CatalogFile = {
  last_change: string | null;
  listings: RawListing[];
};

const FILES: CatalogFile[] = [
  zonaprop as CatalogFile,
  argenprop as CatalogFile,
];

export function loadListings(): Listing[] {
  const out: Listing[] = [];
  for (const file of FILES) {
    for (const raw of file.listings || []) {
      if (!raw?.id) continue;
      out.push({
        id: raw.id,
        site: raw.site || raw.id.split(":")[0],
        url: raw.url || "",
        title: raw.title || "",
        address: raw.address || "",
        zone: raw.zone || "",
        price: raw.price ?? null,
        old_price: raw.old_price ?? null,
        price_history: raw.price_history || [],
        area: raw.area ?? null,
        ambientes: raw.ambientes ?? null,
        photo: raw.photo || "",
        tags: raw.tags || [],
        score: raw.score || 0,
        first_seen: raw.first_seen || null,
        active: raw.active !== false,
        gone_at: raw.gone_at || null,
        usd_per_m2: raw.usd_per_m2 ?? usdPerM2(raw.price ?? null, raw.area ?? null),
        vs_median_pct: raw.vs_median_pct ?? null,
        vs_median_n: raw.vs_median_n ?? null,
        days_seen: raw.days_seen ?? daysSeen(raw.first_seen || null),
        price_drops: raw.price_drops ?? Math.max(0, (raw.price_history || []).length - 1),
        closing_ref_usd: raw.closing_ref_usd ?? closingRef(raw.price ?? null),
        expensas_ars: raw.expensas_ars ?? null,
        expensas_text: raw.expensas_text || "",
        antiguedad_years: raw.antiguedad_years ?? null,
        piso: raw.piso ?? null,
        cochera: raw.cochera ?? null,
      });
    }
  }
  return withMedians(out);
}

function withMedians(listings: Listing[]): Listing[] {
  const buckets = new Map<string, number[]>();
  for (const item of listings) {
    if (!item.active || !item.zone || item.usd_per_m2 == null) continue;
    const arr = buckets.get(item.zone) || [];
    arr.push(item.usd_per_m2);
    buckets.set(item.zone, arr);
  }
  const medians = new Map<string, { median: number; n: number }>();
  for (const [zone, vals] of buckets) {
    if (vals.length < MEDIAN_MIN_N) continue;
    const xs = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    medians.set(zone, { median, n: xs.length });
  }
  return listings.map((item) => {
    const info = item.zone ? medians.get(item.zone) : undefined;
    if (item.usd_per_m2 == null || !info) {
      return { ...item, vs_median_pct: null, vs_median_n: null };
    }
    return {
      ...item,
      vs_median_pct: Math.round(((item.usd_per_m2 - info.median) * 100) / info.median),
      vs_median_n: info.n,
    };
  });
}

export function usdPerM2(price: number | null, area: number | null): number | null {
  if (price == null || area == null || area <= 0) return null;
  return Math.round(price / area);
}

export function daysSeen(firstSeen: string | null, now = Date.now()): number | null {
  if (!firstSeen) return null;
  const t = Date.parse(firstSeen);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

export function closingRef(price: number | null, pct = CLOSING_DISCOUNT_PCT): number | null {
  if (price == null) return null;
  return Math.round(price * (1 - pct / 100));
}

export function lastNovelty(listings: Listing[]): string | null {
  const dates = FILES.map((f) => f.last_change).filter(Boolean) as string[];
  for (const item of listings) {
    if (item.first_seen) dates.push(item.first_seen);
    if (item.gone_at) dates.push(item.gone_at);
    for (const h of item.price_history || []) {
      if (h.date) dates.push(h.date);
    }
  }
  if (!dates.length) return null;
  return dates.sort().at(-1) || null;
}

export function isNew(item: Listing, now = Date.now()): boolean {
  if (!item.first_seen || !item.active) return false;
  const t = Date.parse(item.first_seen);
  if (Number.isNaN(t)) return false;
  return now - t <= 48 * 60 * 60 * 1000;
}

export function hasDrop(item: Listing): boolean {
  return Boolean(item.old_price && item.price && item.old_price > item.price);
}

export function formatUsd(n: number | null): string {
  if (n == null) return "USD s/d";
  return `USD ${n.toLocaleString("es-AR")}`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function siteLabel(site: string): string {
  return site === "argenprop" ? "Argenprop" : site === "zonaprop" ? "Zonaprop" : site;
}

export function zonesOf(listings: Listing[]): string[] {
  return [...new Set(listings.map((x) => x.zone).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}
