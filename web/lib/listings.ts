export type PricePoint = {
  date: string | null;
  price: number | null;
};

export type Verdict = {
  entra: string[];
  resta: string[];
  falta: string[];
  text: string;
};

export type PickFile = {
  id: string | null;
  manual?: boolean;
  note?: string;
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
  verdict: Verdict;
};

export const CLOSING_DISCOUNT_PCT = 5;
export const MEDIAN_MIN_N = 8;
export const GUSTO_USD = 125000;

const ALLOWED_BARRIOS = [
  "recoleta",
  "barrio norte",
  "botanico",
  "palermo botanico",
  "jardin botanico",
  "palermo chico",
];

const REJECT_CITIES = [
  "rosario",
  "echesortu",
  "granadero baigorria",
  "baigorria",
  "fisherton",
  "pichincha",
  "general paz",
  "nueva cordoba",
  "mar de las pampas",
  "pilar",
];

function fold(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function cityHay(item: Pick<RawListing, "title" | "address" | "zone" | "url">): string {
  const slug = (item.url || "").replace(/[-_./]+/g, " ");
  return fold(`${item.title || ""} ${item.address || ""} ${item.zone || ""} ${slug}`);
}

export function inScope(item: Pick<RawListing, "title" | "address" | "zone" | "url">): boolean {
  const hay = cityHay(item);
  if (REJECT_CITIES.some((kw) => {
    if (!hay.includes(kw)) return false;
    if (kw === "general paz" && (hay.includes("av general paz") || hay.includes("avenida general paz"))) {
      return false;
    }
    return true;
  })) {
    return false;
  }
  return ALLOWED_BARRIOS.some((b) => hay.includes(b));
}

export type RawListing = {
  [K in keyof Listing]?: Listing[K] | null;
} & { id: string };

export type CatalogFile = {
  last_change: string | null;
  listings: RawListing[];
};

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

export function isNew(item: Listing, now = Date.now()): boolean {
  if (!item.first_seen || !item.active) return false;
  const t = Date.parse(item.first_seen);
  if (Number.isNaN(t)) return false;
  return now - t <= 48 * 60 * 60 * 1000;
}

export type DropFact = {
  from: number;
  to: number;
  delta: number;
  pct: number;
  at: string | null;
  count: number;
};

export function lastDrop(
  item: Pick<Listing, "price" | "old_price" | "price_history">,
): DropFact | null {
  const hist = item.price_history || [];
  let last: { from: number; to: number; at: string | null } | null = null;
  let count = 0;
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1]?.price;
    const b = hist[i]?.price;
    if (a == null || b == null || b >= a) continue;
    count += 1;
    last = { from: a, to: b, at: hist[i].date || null };
  }
  if (!last && item.old_price != null && item.price != null && item.old_price > item.price) {
    const at = hist.length ? hist[hist.length - 1]?.date || null : null;
    last = { from: item.old_price, to: item.price, at };
    count = Math.max(count, 1);
  }
  if (!last) return null;
  return {
    from: last.from,
    to: last.to,
    delta: last.from - last.to,
    pct: last.from ? Math.round((last.from - last.to) * 100 / last.from) : 0,
    at: last.at,
    count,
  };
}

export function priorPrice(item: Pick<Listing, "price" | "old_price" | "price_history">): number | null {
  return lastDrop(item)?.from ?? null;
}

export function dropAmount(item: Pick<Listing, "price" | "old_price" | "price_history">): number | null {
  return lastDrop(item)?.delta ?? null;
}

export function hasDrop(item: Pick<Listing, "price" | "old_price" | "price_history">): boolean {
  return lastDrop(item) != null;
}

export function dropWhen(iso: string | null, now = Date.now()): string {
  if (!iso) return "en una corrida anterior";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "en una corrida anterior";
  const start = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const days = Math.floor((start(now) - start(t)) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return `el ${formatWhen(iso)}`;
}

export function dropLine(
  item: Pick<Listing, "price" | "old_price" | "price_history">,
  opts: { short?: boolean; now?: number } = {},
): string | null {
  const d = lastDrop(item);
  if (!d) return null;
  const when = dropWhen(d.at, opts.now);
  const from = formatUsd(d.from);
  const to = formatUsd(d.to);
  const cut = `−${formatUsd(d.delta)} · ${d.pct}%`;
  if (opts.short) return `bajó ${when} de ${from} a ${to} (−${d.pct}%)`;
  const times = d.count > 1 ? ` ${d.count} bajas nuestras en total.` : "";
  if (!d.at) {
    return `Bajó de ${from} a ${to} (${cut}) en una corrida anterior. Lo vimos nosotros; el portal no dice cuándo.${times}`;
  }
  const lead = when.charAt(0).toUpperCase() + when.slice(1);
  return `${lead} bajó de ${from} a ${to} (${cut}). Lo vimos nosotros; el portal no dice cuándo.${times}`;
}

export function formatNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "s/d";
  return n.toLocaleString("es-AR");
}

export function formatUsd(n: number | null): string {
  if (n == null) return "USD s/d";
  return `USD ${formatNum(n)}`;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function streetCore(s: string): string {
  const t = tidy(s)
    .replace(/\b([A-Za-zÁÉÍÓÚÑ])\./g, "$1")
    .replace(/,?\s*(capital federal|caba|argentina)\b.*$/i, "")
    .replace(/,?\s*(recoleta|barrio norte|botánico|botanico|palermo chico|palermo)\s*$/i, "");
  return (t.split(",")[0] || t).trim();
}

function intersectionOf(s: string): string | null {
  const m = tidy(s).match(
    /\b((?:av(?:\.|enida)?\s+)?[A-Za-záéíóúñ][A-Za-záéíóúñ]{2,20})\s+y\s+((?:av(?:\.|enida)?\s+)?[A-Za-záéíóúñ][A-Za-záéíóúñ]{2,20})\b/i,
  );
  if (!m) return null;
  return `${m[1]} y ${m[2]}`;
}

function looksLikeStreet(s: string): boolean {
  if (!s || s.length > 56) return false;
  if (/venta|departamento|oportunidad|excelente|luminoso|ambientes/i.test(s) && !/^\S.+\s+\d/.test(s)) {
    return false;
  }
  return /[a-záéíóúñ]{2,}/i.test(s) && /\d{1,5}/.test(s);
}

function clipWords(s: string, max: number): string {
  const t = tidy(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(" ");
  return `${(i > 16 ? cut.slice(0, i) : cut).replace(/[.,;:]+$/, "")}…`;
}

export function streetOf(item: Pick<Listing, "address" | "title">): string {
  const fromAddr = streetCore(item.address || "");
  if (looksLikeStreet(fromAddr)) return fromAddr;
  const fromTitle = streetCore(item.title || "");
  if (looksLikeStreet(fromTitle)) return fromTitle;
  const cross = intersectionOf(item.address || "") || intersectionOf(item.title || "");
  if (cross) return cross;
  if (fromAddr && fromAddr.length < 48 && !/venta|departamento de|excelente/i.test(fromAddr)) {
    return fromAddr;
  }
  return clipWords(item.title || fromAddr || "Sin dirección", 40);
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
  if (site === "argenprop") return "Argenprop";
  if (site === "zonaprop") return "Zonaprop";
  if (site === "mercadolibre") return "Mercado Libre";
  return site;
}

export function zonesOf(listings: Listing[]): string[] {
  return [...new Set(listings.map((x) => x.zone).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

export const TIERS = [
  { id: "mejor", label: "Mejor", min: 3 },
  { id: "bien", label: "Bien", min: 1 },
  { id: "ok", label: "Ok", min: 0 },
  { id: "flojo", label: "Flojo", min: Number.NEGATIVE_INFINITY },
] as const;

export type TierId = (typeof TIERS)[number]["id"];

export function listingTier(score: number): (typeof TIERS)[number] {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}

export function isoWeek(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function inIsoWeek(iso: string | null, week = isoWeek()): boolean {
  return Boolean(iso) && isoWeek(iso) === week;
}

export function rankByScore(a: Listing, b: Listing): number {
  const ds = (b.score || 0) - (a.score || 0);
  if (ds) return ds;
  return (a.price ?? 1e12) - (b.price ?? 1e12);
}
