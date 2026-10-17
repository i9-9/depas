import argenprop from "../data/listings-argenprop.json";
import cabaprop from "../data/listings-cabaprop.json";
import mercadolibre from "../data/listings-mercadolibre.json";
import zonaprop from "../data/listings-zonaprop.json";
import argenpropRun from "../data/run-argenprop.json";
import {
  CLOSING_DISCOUNT_PCT,
  EXPENSAS_MIN_VALID_ARS,
  MEDIAN_MIN_N,
  SOURCE_STALE_HOURS,
  applyAir,
  applyValue,
  closingRef,
  daysSeen,
  clusterListings,
  dealArea,
  flipKeep,
  gapReasons,
  classifyZone,
  fold,
  inScope,
  markClaimedBarrio,
  markFirstWave,
  recoverAreas,
  usdPerM2,
  type CatalogFile,
  type Listing,
} from "@/lib/listings";
import { verdictOf } from "@/lib/verdict";

const FILES: { site: string; file: CatalogFile }[] = [
  { site: "zonaprop", file: zonaprop as CatalogFile },
  { site: "argenprop", file: argenprop as CatalogFile },
  { site: "mercadolibre", file: mercadolibre as CatalogFile },
  { site: "cabaprop", file: cabaprop as CatalogFile },
];

export type SourceGap = {
  site: string;
  reason: "empty" | "stale";
  last_change: string | null;
};

export type PortalRun = {
  site: string;
  ran_at: string | null;
  ok: { name: string; n: number }[];
  errors: string[];
  matched: number;
  new: number;
  drops: number;
  lines: string[];
};

export function loadArgenpropRun(): PortalRun | null {
  const run = argenpropRun as PortalRun;
  if (!run?.ran_at) return null;
  return run;
}

function sourceFreshness(site: string, file: CatalogFile): string | null {
  if (site === "argenprop") {
    const run = loadArgenpropRun();
    if (run?.ran_at) return run.ran_at;
  }
  return file.last_change || null;
}

export function sourceGaps(now = Date.now()): SourceGap[] {
  const staleMs = SOURCE_STALE_HOURS * 3600 * 1000;
  const out: SourceGap[] = [];
  for (const { site, file } of FILES) {
    const n = (file.listings || []).filter((x) => x.active !== false).length;
    const freshness = sourceFreshness(site, file);
    if (!n) {
      out.push({ site, reason: "empty", last_change: freshness });
      continue;
    }
    const t = freshness ? Date.parse(freshness) : NaN;
    if (!Number.isNaN(t) && now - t > staleMs) {
      out.push({ site, reason: "stale", last_change: freshness });
    }
  }
  return out;
}

function withFlags(raw: Listing): Listing {
  const tags = [...(raw.tags || [])];
  if (raw.area_covered == null && raw.area != null && !tags.includes("m² sin verificar")) {
    tags.push("m² sin verificar");
  }
  const hay = fold(`${raw.title || ""} ${raw.address || ""}`);
  if (
    (raw.cochera === true || (/\bcocheras?\b/.test(hay) && !hay.includes("sin cochera"))) &&
    !tags.includes("incluye cochera")
  ) {
    tags.push("incluye cochera");
  }
  let exp = raw.expensas_ars;
  if (exp != null && exp < EXPENSAS_MIN_VALID_ARS) exp = null;
  return {
    ...raw,
    tags: markClaimedBarrio({ ...raw, tags }),
    expensas_ars: exp,
    expensas_text: exp == null ? "" : raw.expensas_text,
  };
}

function scoredListings(): Listing[] {
  const out: Listing[] = [];
  for (const { file } of FILES) {
    for (const raw of file.listings || []) {
      if (!raw?.id || !inScope(raw)) continue;
      const classified = classifyZone(raw);
      const zone = classified || "";
      const areas = recoverAreas(raw);
      const area = areas.area;
      out.push(
        withFlags({
          id: raw.id,
          site: raw.site || raw.id.split(":")[0],
          url: raw.url || "",
          title: raw.title || "",
          blurb: raw.blurb || "",
          address: raw.address || "",
          zone,
          price: raw.price ?? null,
          old_price: raw.old_price ?? null,
          price_history: raw.price_history || [],
          area,
          area_total: areas.area_total,
          area_covered: areas.area_covered,
          area_semi: areas.area_semi,
          ambientes: raw.ambientes ?? null,
          photo: raw.photo || "",
          tags: raw.tags || [],
          score: raw.score || 0,
          first_seen: raw.first_seen || null,
          active: raw.active !== false,
          gone_at: raw.gone_at || null,
          usd_per_m2: usdPerM2(raw.price ?? null, area),
          vs_median_pct: null,
          vs_median_n: null,
          days_seen: raw.days_seen ?? daysSeen(raw.first_seen || null),
          price_drops: raw.price_drops ?? Math.max(0, (raw.price_history || []).length - 1),
          closing_ref_usd: raw.closing_ref_usd ?? closingRef(raw.price ?? null, CLOSING_DISCOUNT_PCT),
          expensas_ars: raw.expensas_ars ?? null,
          expensas_text: raw.expensas_text || "",
          antiguedad_years: raw.antiguedad_years ?? null,
          piso: raw.piso ?? null,
          cochera: raw.cochera ?? null,
          air_usd: null,
          exit_usd_m2: raw.exit_usd_m2 ?? null,
          reno_usd_m2: raw.reno_usd_m2 ?? null,
          neto_base_usd: null,
          neto_hard_usd: null,
          roi_base: null,
          roi_hard: null,
          breakeven_exit_usd_m2: null,
          max_offer_usd: null,
          seventy_offer_usd: null,
          decision: null,
          price_source: raw.price_source || "card",
          address_unverified: Boolean(raw.address_unverified),
          zone_unverified: !classified,
          verdict: { entra: [], resta: [], falta: [], text: "" },
          ids: [raw.id],
          mirrors: [],
          from_first_wave: false,
        }),
      );
    }
  }
  return markFirstWave(withMedians(out).map((item) => applyAir(applyValue(item))));
}

export function loadListings(): Listing[] {
  return clusterListings(
    scoredListings()
      .filter((item) => flipKeep({ ...item, area: dealArea(item) }))
      .map((item) => ({ ...item, verdict: verdictOf(item) })),
  );
}

/** En zona y activos, pero se caen por balcón, luz, metros, precio u otra cosa. */
export function loadNearListings(): Listing[] {
  const keep = new Set(loadListings().flatMap((item) => item.ids));
  const near = scoredListings()
    .filter((item) => item.active && item.zone && !item.zone_unverified && !keep.has(item.id))
    .map((item) => ({ ...item, gaps: gapReasons({ ...item, area: dealArea(item) }) }))
    .filter((item) => (item.gaps || []).length > 0)
    .map((item) => ({ ...item, verdict: verdictOf(item) }));
  near.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return clusterListings(near);
}

function withMedians(listings: Listing[]): Listing[] {
  const buckets = new Map<string, number[]>();
  for (const item of listings) {
    if (!item.active || !item.zone || item.usd_per_m2 == null) continue;
    if ((item.tags || []).includes("incluye cochera")) continue;
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
  const dates = FILES.map((f) => f.file.last_change).filter(Boolean) as string[];
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
