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
};

export type CatalogFile = {
  last_change: string | null;
  listings: Listing[];
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
      });
    }
  }
  return out;
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
