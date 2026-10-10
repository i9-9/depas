import streetZonesFile from "../data/street-zones.json";

type StreetRule = {
  street: string;
  min?: number;
  max?: number;
  zone?: string;
  out?: boolean;
};

const STREET_ZONES: StreetRule[] = streetZonesFile.street_zones || [];
const REJECT_BARRIOS: string[] = streetZonesFile.reject_barrios || [];

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

export type Mirror = {
  id: string;
  site: string;
  url: string;
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
  air_usd: number | null;
  exit_usd_m2: number | null;
  reno_usd_m2: number | null;
  verdict: Verdict;
  ids: string[];
  mirrors: Mirror[];
  from_first_wave: boolean;
};

export const CLOSING_DISCOUNT_PCT = 5;
export const MEDIAN_MIN_N = 8;
export const GUSTO_USD = 125000;
export const VALUE_CHEAP_PCT = -8;
export const VALUE_STEAL_PCT = -15;
export const VALUE_RICH_PCT = 20;
export const EXPENSAS_HIGH_ARS = 300000;
export const EXPENSAS_LOUD_ARS = 380000;
export const RENO_USD_M2 = 250;
export const AIR_OK_USD = 25000;
export const AIR_WIDE_USD = 40000;
export const EXIT_USD_M2: Record<string, number> = {
  Recoleta: 2750,
  "Barrio Norte": 2750,
  Botánico: 3000,
  "Palermo Chico": 3600,
};
export const WEAK_STREETS = ["paso", "jean jaures", "jean jaure"];
export const WEAK_STREET_EXIT_USD_M2 = 2200;

const FLIP_TAGS: Record<string, number> = {
  "aire amplio": 3,
  aire: 2,
  "sin aire": -2,
  tesis: 2,
  "planta baja": -1,
  "zona floja": -4,
};

const VALUE_TAGS: Record<string, number> = {
  "metro barato": 1,
  "metro muy barato": 2,
  "metro caro": -1,
  "expensas altas": -1,
  "expensas muy altas": -2,
};

export function applyValue(item: Listing): Listing {
  let score = item.score || 0;
  const kept = (item.tags || []).filter((t) => {
    if (t in VALUE_TAGS) {
      score -= VALUE_TAGS[t];
      return false;
    }
    return true;
  });
  const added: string[] = [];
  const vs = item.vs_median_pct;
  if (vs != null) {
    if (vs <= VALUE_STEAL_PCT) added.push("metro muy barato");
    else if (vs <= VALUE_CHEAP_PCT) added.push("metro barato");
    else if (vs >= VALUE_RICH_PCT) added.push("metro caro");
  }
  const exp = item.expensas_ars;
  if (exp != null) {
    if (exp >= EXPENSAS_LOUD_ARS) added.push("expensas muy altas");
    else if (exp >= EXPENSAS_HIGH_ARS) added.push("expensas altas");
  }
  for (const t of added) {
    score += VALUE_TAGS[t];
    kept.push(t);
  }
  return { ...item, score, tags: kept };
}

export function streetNameOf(item: Pick<Listing, "address" | "title">): string {
  const key = streetKey(item.address || "") || streetKey(item.title || "");
  return key.replace(/\s+\d+$/, "").trim();
}

export function isWeakStreet(item: Pick<Listing, "address" | "title">): boolean {
  const name = streetNameOf(item);
  const hay = fold(`${item.address || ""} ${item.title || ""}`);
  return WEAK_STREETS.some((w) => {
    if (name === w || name.startsWith(`${w} `)) return true;
    return new RegExp(`(?<![a-z0-9])${w}\\s+\\d{2,5}\\b`).test(hay);
  });
}

export function exitUsdM2Of(zone: string, item?: Pick<Listing, "address" | "title">): number | null {
  if (item && isWeakStreet(item)) return WEAK_STREET_EXIT_USD_M2;
  return zone in EXIT_USD_M2 ? EXIT_USD_M2[zone] : null;
}

export function airUsdOf(item: Pick<Listing, "price" | "area" | "zone" | "address" | "title">): number | null {
  const exitM2 = exitUsdM2Of(item.zone || "", item);
  if (item.price == null || item.area == null || item.area <= 0 || exitM2 == null) return null;
  return Math.round(exitM2 * item.area - item.price - RENO_USD_M2 * item.area);
}

export function applyAir(item: Listing): Listing {
  let score = item.score || 0;
  const kept = (item.tags || []).filter((t) => {
    if (t in FLIP_TAGS) {
      score -= FLIP_TAGS[t];
      return false;
    }
    return true;
  });
  const exitM2 = exitUsdM2Of(item.zone || "", item);
  const air = airUsdOf(item);
  const added: string[] = [];
  if (air != null) {
    if (air >= AIR_WIDE_USD) added.push("aire amplio");
    else if (air >= AIR_OK_USD) added.push("aire");
    else if (air < 0) added.push("sin aire");
  }
  if (kept.includes("para reciclar") && kept.includes("edificio ok") && !kept.includes("tesis")) {
    added.push("tesis");
  }
  if (item.piso === 0 && !kept.includes("planta baja")) added.push("planta baja");
  if (isWeakStreet(item) && !kept.includes("zona floja")) added.push("zona floja");
  for (const t of added) {
    score += FLIP_TAGS[t];
    kept.push(t);
  }
  return {
    ...item,
    score,
    tags: kept,
    air_usd: air,
    exit_usd_m2: exitM2,
    reno_usd_m2: RENO_USD_M2,
  };
}

export function flipKeep(item: Pick<Listing, "active" | "area" | "expensas_ars" | "tags">): boolean {
  if (!item.active) return true;
  if (item.area == null) return false;
  if (item.expensas_ars != null && item.expensas_ars > EXPENSAS_LOUD_ARS) return false;
  const tags = item.tags || [];
  if (tags.includes("metro caro")) return false;
  if (tags.includes("edificio flojo") || tags.includes("edificio a reciclar")) return false;
  return true;
}

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

export function fold(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const STREET_NOISE =
  /\b(recoleta|barrio norte|botanico|palermo chico|palermo|capital federal|caba|argentina|departamento|depto|ambientes|amb)\b/g;

export function streetKey(address: string): string {
  let t = fold(address || "");
  t = t.replace(/avenida/g, "av").replace(/av\./g, "av ");
  t = t.replace(/(\d)\.(\d{3})\b/g, "$1$2");
  t = t.replace(/\bal\s+/g, " ");
  t = t.replace(STREET_NOISE, " ");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  const m = t.match(/([a-z]+(?:\s+[a-z]+){0,3})\s+(\d{2,5})\b/);
  return m ? `${m[1]} ${m[2]}` : "";
}

const STREET_ALIASES: [string, string][] = [
  ["marcelo torcuato de alvear", "alvear"],
  ["general lucio norberto mansilla", "mansilla"],
  ["lucio mansilla", "mansilla"],
  ["jose antonio cabrera", "cabrera"],
  ["jose a cabrera", "cabrera"],
  ["av scalabrini ortiz", "scalabrini ortiz"],
  ["scalabrini", "scalabrini ortiz"],
  ["cnel diaz", "coronel diaz"],
  ["cnl diaz", "coronel diaz"],
  ["av las heras", "las heras"],
  ["av santa fe", "santa fe"],
  ["av cordoba", "cordoba"],
  ["av pueyrredon", "pueyrredon"],
  ["jose maria gutierrez", "gutierrez"],
  ["j m gutierrez", "gutierrez"],
  ["san martin de tours", "san martin de tours"],
  ["republica de la india", "republica de la india"],
  ["rodriguez pena", "rodriguez pena"],
  ["jean jaures", "jean jaures"],
  ["coronel diaz", "coronel diaz"],
  ["mario bravo", "mario bravo"],
  ["pacheco de melo", "pacheco de melo"],
  ["vicente lopez", "vicente lopez"],
];

function streetNames(): string[] {
  const names = new Set<string>();
  for (const [raw, canon] of STREET_ALIASES) {
    names.add(raw);
    names.add(canon);
  }
  for (const rule of STREET_ZONES) {
    const st = fold(rule.street || "");
    if (st) names.add(st);
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function normStreet(name: string): string {
  let n = fold(name || "").replace(/\b(av|avenida)\b/g, " ").replace(/\s+/g, " ").trim();
  for (const [raw, canon] of STREET_ALIASES) {
    if (n === raw || n.startsWith(raw + " ")) return canon;
  }
  return n;
}

function cleanStreetText(text: string): string {
  let t = fold(text || "");
  t = t.replace(/avenida/g, " ").replace(/av\./g, " ");
  t = t.replace(/(\d)\.(\d{3})\b/g, "$1$2");
  t = t.replace(/\bal\s+/g, " ");
  t = t.replace(STREET_NOISE, " ");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function tokenIn(hay: string, phrase: string): boolean {
  const p = fold(phrase);
  if (!p) return false;
  return new RegExp(`(?<![a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(fold(hay));
}

function findStreet(text: string, streets: string[]): [string, number | null] {
  const t = cleanStreetText(text);
  if (!t) return ["", null];
  let bestName = "";
  let bestNum: number | null = null;
  let bestScore = -1;
  for (const street of streets) {
    const re = new RegExp(`(?<![a-z0-9])${street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const rest = t.slice(m.index + m[0].length).trim();
      const nm = rest.match(/^(\d{2,5})\b/);
      const num = nm ? Number(nm[1]) : null;
      const score = street.length * 10 + (num != null ? 5 : 0);
      if (score > bestScore) {
        bestName = street;
        bestNum = num;
        bestScore = score;
      }
    }
  }
  return bestName ? [normStreet(bestName), bestNum] : ["", null];
}

function parseStreet(text: string): [string, number | null] {
  const streets = streetNames();
  const key = streetKey(text || "");
  if (key) {
    const idx = key.lastIndexOf(" ");
    const name = key.slice(0, idx);
    const num = key.slice(idx + 1);
    if (/^\d+$/.test(num)) {
      const n = normStreet(name);
      if (streets.includes(n)) return [n, Number(num)];
      for (const st of streets) {
        if (n === st || n.endsWith(" " + st)) return [normStreet(st), Number(num)];
      }
    }
  }
  const found = findStreet(text || "", streets);
  if (found[0]) return found;
  const t = cleanStreetText(text || "");
  return t ? [normStreet(t), null] : ["", null];
}

function ruleHits(rule: StreetRule, name: string, num: number | null): boolean {
  const street = fold(rule.street || "");
  if (!street || !name) return false;
  if (!(name === street || name.startsWith(street + " ") || street.startsWith(name + " "))) return false;
  if (num == null) return rule.min == null && rule.max == null;
  if (rule.min != null && num < rule.min) return false;
  if (rule.max != null && num > rule.max) return false;
  return true;
}

function outOnlyStreets(): string[] {
  const by = new Map<string, StreetRule[]>();
  for (const rule of STREET_ZONES) {
    const st = fold(rule.street || "");
    if (!st) continue;
    const arr = by.get(st) || [];
    arr.push(rule);
    by.set(st, arr);
  }
  return [...by.entries()].filter(([, rules]) => rules.length && rules.every((r) => r.out)).map(([st]) => st);
}

function mentionsOutStreet(text: string): boolean {
  if (!text) return false;
  const names = streetNames();
  const outOnly = outOnlyStreets().sort((a, b) => b.length - a.length);
  for (const st of outOnly) {
    if (!tokenIn(text, st)) continue;
    if (names.some((x) => x !== st && x.startsWith(st + " ") && tokenIn(text, x))) continue;
    return true;
  }
  return false;
}

/** Barrio por calle + altura. `null` = fuera. `""` = no se pudo fijar. */
export function classifyZone(item: Pick<RawListing, "address" | "title">): string | null {
  const address = item.address || "";
  if (mentionsOutStreet(address)) return null;
  let [name, num] = parseStreet(address);
  if (!name) [name, num] = parseStreet(item.title || "");
  if (!name) return "";
  let hits = STREET_ZONES.filter((r) => ruleHits(r, name, num));
  if (!hits.length && num != null) {
    hits = STREET_ZONES.filter((r) => ruleHits(r, name, null) && r.out);
  }
  if (!hits.length) return "";
  hits.sort((a, b) => {
    const la = fold(a.street || "").length;
    const lb = fold(b.street || "").length;
    if (lb !== la) return lb - la;
    const ra = a.min != null || a.max != null ? 1 : 0;
    const rb = b.min != null || b.max != null ? 1 : 0;
    return rb - ra;
  });
  const rule = hits[0];
  if (rule.out) return null;
  return rule.zone || "";
}

export function placeKey(item: Pick<Listing, "address" | "title" | "area" | "ambientes">): string {
  const street = streetKey(item.address || "") || streetKey(item.title || "");
  if (!street || item.area == null || item.ambientes == null) return "";
  const bucket = Math.round(item.area / 5) * 5;
  return `${street}|${bucket}|${item.ambientes}`;
}

export function clusterListings(items: Listing[]): Listing[] {
  const groups = new Map<string, Listing[]>();
  const leftover: Listing[] = [];
  for (const item of items) {
    const key = placeKey(item);
    if (!key) {
      leftover.push({ ...item, ids: item.ids?.length ? item.ids : [item.id], mirrors: item.mirrors || [] });
      continue;
    }
    const arr = groups.get(key) || [];
    arr.push(item);
    groups.set(key, arr);
  }
  const clustered: Listing[] = [];
  for (const arr of groups.values()) {
    const ranked = [...arr].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (Boolean(a.photo) !== Boolean(b.photo)) return a.photo ? -1 : 1;
      return rankByScore(a, b);
    });
    const primary = ranked[0];
    clustered.push({
      ...primary,
      ids: arr.map((x) => x.id),
      mirrors: ranked.slice(1).map((x) => ({
        id: x.id,
        site: x.site,
        url: x.url,
        price: x.price,
      })),
    });
  }
  return [...clustered, ...leftover];
}

function cityHay(item: Pick<RawListing, "title" | "address" | "zone" | "url">): string {
  const slug = (item.url || "").replace(/[-_./]+/g, " ");
  return fold(`${item.title || ""} ${item.address || ""} ${item.zone || ""} ${slug}`);
}

function locationHay(item: Pick<RawListing, "address" | "zone" | "url">): string {
  const slug = (item.url || "").replace(/[-_./]+/g, " ");
  return fold(`${item.address || ""} ${item.zone || ""} ${slug}`);
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
  const loc = locationHay(item);
  if (REJECT_BARRIOS.some((kw) => loc.includes(fold(kw)))) return false;
  const z = classifyZone(item);
  if (z === null) return false;
  if (z) return true;
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

const FRESH_MS = 48 * 60 * 60 * 1000;
const FIRST_WAVE_MS = 24 * 60 * 60 * 1000;
export const LOUD_SCORE = 3;

export function markFirstWave(listings: Listing[]): Listing[] {
  const bySite = new Map<string, number[]>();
  for (const item of listings) {
    const t = Date.parse(item.first_seen || "");
    if (Number.isNaN(t)) continue;
    const arr = bySite.get(item.site) || [];
    arr.push(t);
    bySite.set(item.site, arr);
  }
  const ends = new Map<string, number>();
  for (const [site, times] of bySite) {
    times.sort((a, b) => a - b);
    const start = times[0];
    const wave = times.filter((t) => t - start <= FIRST_WAVE_MS);
    ends.set(site, wave[wave.length - 1]);
  }
  return listings.map((item) => {
    const t = Date.parse(item.first_seen || "");
    const end = ends.get(item.site);
    return {
      ...item,
      from_first_wave: end != null && !Number.isNaN(t) && t <= end,
    };
  });
}

export function isNew(item: Listing, now = Date.now()): boolean {
  if (item.from_first_wave) return false;
  if (!item.first_seen || !item.active) return false;
  const t = Date.parse(item.first_seen);
  if (Number.isNaN(t)) return false;
  return now - t <= FRESH_MS;
}

export function isStrong(item: Pick<Listing, "score">): boolean {
  return (item.score || 0) >= LOUD_SCORE;
}

export function isRecentDrop(item: Listing, now = Date.now()): boolean {
  const d = lastDrop(item);
  if (!d) return false;
  if (!d.at) return true;
  const t = Date.parse(d.at);
  if (Number.isNaN(t)) return true;
  return now - t <= FRESH_MS;
}

export function isAlert(item: Listing, now = Date.now()): boolean {
  if (!item.active) return false;
  if (!isStrong(item)) return false;
  return isNew(item, now) || isRecentDrop(item, now);
}

export function hotListings(listings: Listing[], now = Date.now()): Listing[] {
  return listings
    .filter((item) => isAlert(item, now))
    .sort((a, b) => {
      const byScore = rankByScore(a, b);
      if (byScore) return byScore;
      return Date.parse(b.first_seen || "") - Date.parse(a.first_seen || "");
    });
}

export function publishedAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return days === 1 ? "hace 1 día" : `hace ${days} días`;
  return formatWhen(iso);
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
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR");
}

export function formatUsd(n: number | null): string {
  if (n == null) return "USD —";
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
  { id: "mejor", label: "Los que más encajan", min: 3 },
  { id: "bien", label: "Andan bien", min: 1 },
  { id: "ok", label: "Sirven", min: 0 },
  { id: "flojo", label: "Más flojos", min: Number.NEGATIVE_INFINITY },
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
