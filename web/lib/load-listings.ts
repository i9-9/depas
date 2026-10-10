import argenprop from "../data/listings-argenprop.json";
import mercadolibre from "../data/listings-mercadolibre.json";
import zonaprop from "../data/listings-zonaprop.json";
import {
  CLOSING_DISCOUNT_PCT,
  MEDIAN_MIN_N,
  closingRef,
  daysSeen,
  clusterListings,
  inScope,
  usdPerM2,
  type CatalogFile,
  type Listing,
} from "@/lib/listings";
import { verdictOf } from "@/lib/verdict";

const FILES: CatalogFile[] = [
  zonaprop as CatalogFile,
  argenprop as CatalogFile,
  mercadolibre as CatalogFile,
];

export function loadListings(): Listing[] {
  const out: Listing[] = [];
  for (const file of FILES) {
    for (const raw of file.listings || []) {
      if (!raw?.id || !inScope(raw)) continue;
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
        closing_ref_usd: raw.closing_ref_usd ?? closingRef(raw.price ?? null, CLOSING_DISCOUNT_PCT),
        expensas_ars: raw.expensas_ars ?? null,
        expensas_text: raw.expensas_text || "",
        antiguedad_years: raw.antiguedad_years ?? null,
        piso: raw.piso ?? null,
        cochera: raw.cochera ?? null,
        verdict: verdictOf(raw),
        ids: [raw.id],
        mirrors: [],
      });
    }
  }
  return clusterListings(withMedians(out));
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
