import streetZonesFile from "../data/street-zones.json";
import scoring from "../data/scoring.json";

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
  area_total: number | null;
  area_covered: number | null;
  area_semi: number | null;
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
  neto_base_usd: number | null;
  neto_hard_usd: number | null;
  roi_base: number | null;
  roi_hard: number | null;
  breakeven_exit_usd_m2: number | null;
  max_offer_usd: number | null;
  seventy_offer_usd: number | null;
  decision: "comprar" | "negociar" | "vigilar" | "descartar" | null;
  price_source: "card" | string;
  address_unverified: boolean;
  zone_unverified: boolean;
  verdict: Verdict;
  ids: string[];
  mirrors: Mirror[];
  from_first_wave: boolean;
};

export const CLOSING_DISCOUNT_PCT = scoring.closing_discount_pct;
export const MEDIAN_MIN_N = scoring.median_min_n;
export const GUSTO_USD = scoring.gusto_usd;
export const VALUE_CHEAP_PCT = scoring.value_cheap_pct;
export const VALUE_STEAL_PCT = scoring.value_steal_pct;
export const VALUE_RICH_PCT = scoring.value_rich_pct;
export const VALUE_SUSPECT_PCT = scoring.value_suspect_pct;
export const EXPENSAS_HIGH_ARS = scoring.expensas_high_ars;
export const EXPENSAS_LOUD_ARS = scoring.expensas_loud_ars;
export const EXPENSAS_MIN_VALID_ARS = scoring.expensas_min_valid_ars;
export const RENO_USD_M2 = scoring.reno_usd_m2_recycle;
export const AIR_OK_USD = scoring.air_ok_usd;
export const AIR_WIDE_USD = scoring.air_wide_usd;
export const EXIT_USD_M2: Record<string, number> = scoring.exit_usd_m2;
export const WEAK_STREET_EXIT_USD_M2 = scoring.weak_street_exit_usd_m2;
export const SOURCE_STALE_HOURS = scoring.source_stale_hours;
export const NETO_HARD_MEJOR_USD = scoring.neto_hard_mejor_usd;
export const NETO_HARD_BIEN_USD = scoring.neto_hard_bien_usd;
export const NETO_HARD_OK_USD = scoring.neto_hard_ok_usd;
export const MIN_PRICE_USD = scoring.min_price_usd;
export const REQUIRE_BALCON = scoring.require_balcon;
export const REQUIRE_LIGHT = scoring.require_light;

type WeakRule = { street: string; min?: number; max?: number };
export const WEAK_STREETS: WeakRule[] = (scoring.weak_streets || []).map((x: string | WeakRule) =>
  typeof x === "string" ? { street: x } : x,
);

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
  "metro sospechoso": -1,
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
    if (vs <= VALUE_SUSPECT_PCT) added.push("metro sospechoso");
    else if (vs <= VALUE_STEAL_PCT) added.push("metro muy barato");
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
  const [name] = parseStreetNum(item);
  if (name) return name;
  const key = streetKey(item.address || "") || streetKey(item.title || "");
  return key.replace(/\s+\d+$/, "").trim();
}

export function dealArea(item: Pick<Listing, "area" | "area_covered"> | RawListing): number | null {
  if (item.area != null && item.area > 0) return item.area;
  if (item.area_covered != null && item.area_covered > 0) return item.area_covered;
  return null;
}

export function recoverAreas(raw: RawListing): {
  area: number | null;
  area_total: number | null;
  area_covered: number | null;
  area_semi: number | null;
} {
  const hay = `${raw.title || ""} ${raw.address || ""}`;
  let covered = raw.area_covered ?? null;
  let total = raw.area_total ?? null;
  let semi = raw.area_semi ?? null;
  if (covered == null) {
    const m = hay.match(/([\d.,]+)\s*m²\s*(?:de\s+)?superficie\s+constru/i);
    if (m) covered = Number(m[1].replace(".", "").replace(",", "."));
  }
  if (covered == null) {
    const m = hay.match(/([\d.,]+)\s*m²\s*(?:cubiert|cubie)/i);
    if (m) covered = Number(m[1].replace(",", "."));
  }
  if (total == null && raw.area != null && covered == null) total = raw.area;
  const deal = weightedArea(covered, semi, total) ?? raw.area ?? covered ?? total ?? null;
  return { area: deal, area_total: total, area_covered: covered, area_semi: semi };
}

export function weightedArea(
  covered: number | null,
  semi: number | null,
  total: number | null,
): number | null {
  const wC = scoring.area_weight_covered;
  const wS = scoring.area_weight_semi;
  const wU = scoring.area_weight_uncovered;
  if (covered != null && semi != null && total != null) {
    return covered * wC + semi * wS + Math.max(0, total - covered - semi) * wU;
  }
  if (covered != null && semi != null) return covered * wC + semi * wS;
  if (covered != null) return covered * wC;
  return total;
}

function renoUsdM2Of(item: Pick<Listing, "tags">, hard = false): number {
  const tags = item.tags || [];
  const recycle = tags.includes("para reciclar");
  const finished = tags.includes("ya hecho") || (tags.includes("edificio ok") && !recycle);
  if (recycle || !finished) {
    return hard ? scoring.reno_usd_m2_recycle_hard : scoring.reno_usd_m2_recycle;
  }
  return hard ? scoring.reno_usd_m2_ok_hard : scoring.reno_usd_m2_ok;
}

function holdUsdOf(item: Pick<Listing, "expensas_ars">, hard = false): number {
  const exp = item.expensas_ars;
  const fx = scoring.fx_ars_usd;
  if (exp == null || fx <= 0) return 0;
  const months = hard ? scoring.hold_months_hard : scoring.hold_months;
  return (exp / fx) * months;
}

export function isWeakStreet(item: Pick<Listing, "address" | "title">): boolean {
  let [name, num] = parseStreet(item.address || "");
  if (!name) [name, num] = parseStreet(item.title || "");
  if (!name) return false;
  const hay = fold(`${item.address || ""} ${item.title || ""}`);
  return WEAK_STREETS.some((rule) => {
    if (ruleHits(rule, name, num)) return true;
    const st = fold(rule.street || "");
    if (num == null && st && new RegExp(`(?<![a-z0-9])${st}\\s+\\d{2,5}\\b`).test(hay)) {
      return rule.min == null && rule.max == null;
    }
    return false;
  });
}

export function exitUsdM2Of(zone: string, item?: Pick<Listing, "address" | "title">): number | null {
  if (item && isWeakStreet(item)) return WEAK_STREET_EXIT_USD_M2;
  return zone in EXIT_USD_M2 ? EXIT_USD_M2[zone] : null;
}

export function airUsdOf(
  item: Pick<Listing, "price" | "area" | "area_covered" | "zone" | "address" | "title" | "tags">,
): number | null {
  if ((item.tags || []).includes("incluye cochera")) return null;
  const exitM2 = exitUsdM2Of(item.zone || "", item);
  const area = dealArea(item);
  if (item.price == null || area == null || area <= 0 || exitM2 == null) return null;
  const reno = renoUsdM2Of(item);
  return Math.round(exitM2 * area - item.price - reno * area);
}

export function applyNet(item: Listing): Listing {
  const base = flipResult(item, false);
  const hard = flipResult(item, true);
  const maxOffer = hard?.maxOffer ?? null;
  return {
    ...item,
    neto_base_usd: base?.neto ?? null,
    neto_hard_usd: hard?.neto ?? null,
    roi_base: base?.roi ?? null,
    roi_hard: hard?.roi ?? null,
    breakeven_exit_usd_m2: hard?.breakeven ?? null,
    max_offer_usd: maxOffer,
    seventy_offer_usd: seventyOfferOf(item),
    decision: decisionOf(item.price, maxOffer),
  };
}

function flipResult(
  item: Listing,
  hard: boolean,
): { neto: number; roi: number | null; breakeven: number | null; maxOffer: number | null } | null {
  if ((item.tags || []).includes("incluye cochera")) return null;
  const area = dealArea(item);
  const exitM2 = exitUsdM2Of(item.zone || "", item);
  if (item.price == null || area == null || area <= 0 || exitM2 == null) return null;
  const buy = (hard ? scoring.buy_cost_pct_hard : scoring.buy_cost_pct) / 100;
  const sale = (hard ? scoring.sale_cost_pct_hard : scoring.sale_cost_pct) / 100;
  const closing = hard ? scoring.closing_discount_pct / 100 : 0;
  const reno = renoUsdM2Of(item, hard);
  const hold = holdUsdOf(item, hard);
  const proceeds = exitM2 * area * (1 - closing) * (1 - sale);
  const cost = item.price * (1 + buy) + reno * area + hold;
  const neto = proceeds - cost;
  const denom = area * (1 - closing) * (1 - sale);
  const maxOffer = 1 + buy ? (proceeds - reno * area - hold) / (1 + buy) : null;
  return {
    neto: Math.round(neto),
    roi: cost ? Math.round((neto / cost) * 10000) / 10000 : null,
    breakeven: denom ? Math.round(cost / denom) : null,
    maxOffer: maxOffer == null ? null : Math.round(maxOffer),
  };
}

export function seventyOfferOf(item: Listing): number | null {
  const area = dealArea(item);
  const exitM2 = exitUsdM2Of(item.zone || "", item);
  if (area == null || area <= 0 || exitM2 == null) return null;
  const reno = renoUsdM2Of(item, false);
  return Math.round((scoring.rule_70_pct / 100) * exitM2 * area - reno * area);
}

export function decisionOf(
  price: number | null,
  maxOffer: number | null,
): Listing["decision"] {
  if (price == null || maxOffer == null || maxOffer <= 0) return null;
  const ratio = price / maxOffer;
  if (ratio <= scoring.decision_buy_pct / 100) return "comprar";
  if (price <= maxOffer) return "negociar";
  if (ratio <= scoring.decision_watch_pct / 100) return "vigilar";
  return "descartar";
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
  const air = airUsdOf({ ...item, tags: kept });
  const reno = renoUsdM2Of(item);
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
    score += FLIP_TAGS[t] || 0;
    kept.push(t);
  }
  return applyNet({
    ...item,
    score,
    tags: kept,
    air_usd: air,
    exit_usd_m2: exitM2,
    reno_usd_m2: reno,
  });
}

function cardHay(item: Pick<Listing, "title" | "address" | "url"> | Pick<RawListing, "title" | "address" | "url">): string {
  const slug = (item.url || "").replace(/[-_./]+/g, " ");
  return fold(`${item.title || ""} ${slug} ${item.address || ""}`);
}

export function hasBalcon(item: Pick<Listing, "title" | "address" | "url">): boolean | null {
  const hay = cardHay(item);
  if (hay.includes("sin balcon") || hay.includes("sin balcones")) return false;
  if (hay.includes("balcon") || hay.includes("balcones")) return true;
  return null;
}

export function hasLight(item: Pick<Listing, "title" | "address" | "url">): boolean | null {
  const hay = cardHay(item);
  if (/poca luz|sin luz|poco luminoso|\boscur/.test(hay)) return false;
  if (/\b(depto|departamento|unidad)\s+intern[oa]s?\b/.test(hay)) return false;
  if (/luminos|luz natural|mucha luz|todo luz|llena de luz|solead|vista abierta|vista panoram/.test(hay)) {
    return true;
  }
  if (/\bal frente\b/.test(hay) && !hay.includes("frente a")) return true;
  return null;
}

export function flipKeep(
  item: Pick<
    Listing,
    "active" | "area" | "price" | "expensas_ars" | "tags" | "zone_unverified" | "title" | "address" | "url"
  >,
): boolean {
  if (!item.active) return true;
  if (item.area == null) return false;
  if (item.area < scoring.min_area_m2) return false;
  if (item.price == null || item.price < MIN_PRICE_USD) return false;
  if (item.expensas_ars != null && item.expensas_ars > EXPENSAS_LOUD_ARS) return false;
  const tags = item.tags || [];
  if (tags.includes("metro caro")) return false;
  if (tags.includes("edificio flojo") || tags.includes("edificio a reciclar")) return false;
  if (tags.includes("zona floja") || tags.includes("barrio del aviso no coincide")) return false;
  if (item.zone_unverified) return false;
  // Balcón y luz ya los cortó el scraper con el texto de la card. El JSON no
  // guarda ese blurb: reparsear título/URL tira avisos que sí habían pasado.
  if (REQUIRE_BALCON && hasBalcon(item) === false) return false;
  if (REQUIRE_LIGHT && hasLight(item) === false) return false;
  return true;
}

export function markClaimedBarrio(
  item: Pick<Listing, "title" | "url" | "tags">,
): string[] {
  const tags = [...(item.tags || [])];
  const title = fold(`${item.title || ""} ${item.url || ""}`);
  const claimedBad = REJECT_BARRIOS.some((kw) => {
    const k = fold(kw);
    if (!k || !title.includes(k)) return false;
    return !new RegExp(`a pasos de\\s+${k}`).test(title);
  });
  if (claimedBad && !tags.includes("barrio del aviso no coincide")) {
    tags.push("barrio del aviso no coincide");
  }
  return tags;
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
  /\b(recoleta|barrio norte|botanico|palermo chico|palermo|capital federal|caba|argentina|departamento|depto|ambientes|amb|visto|fotos?)\b/g;

function stripListChrome(t: string): string {
  t = t.replace(/ver\s+m[aá]s\s+fotos?/gi, " ");
  t = t.replace(/\b(visto|fotos?)\s+\d[\d.]*\b/gi, " ");
  t = t.replace(/\b\d+\s*\/\s*\d+\b/g, " ");
  t = t.replace(/(?:^|\s)\+\s*\d+(?=\s|$)/g, " ");
  return t;
}

export function streetKey(address: string): string {
  let t = fold(address || "");
  t = t.replace(/avenida/g, "av").replace(/av\./g, "av ");
  t = t.replace(/(\d)\.(\d{3})\b/g, "$1$2");
  t = stripListChrome(t);
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
  ["jean jaure", "jean jaures"],
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
  t = stripListChrome(t);
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

function sameStreet(rule: StreetRule, name: string): boolean {
  return ruleHits({ ...rule, min: undefined, max: undefined }, name, null);
}

/** Barrio por calle + altura. `null` = fuera. `""` = no se pudo fijar. El aviso no manda. */
export function classifyZone(item: Pick<RawListing, "address" | "title">): string | null {
  const address = item.address || "";
  if (mentionsOutStreet(address)) return null;
  let [name, num] = parseStreet(address);
  if (!name) [name, num] = parseStreet(item.title || "");
  if (!name) return "";
  const mine = STREET_ZONES.filter((r) => sameStreet(r, name));
  if (!mine.length) return "";
  const ranged = mine.filter((r) => r.min != null || r.max != null);
  const pool = num != null && ranged.length ? ranged : mine;
  let hits = pool.filter((r) => ruleHits(r, name, num));
  if (!hits.length && num != null) {
    hits = mine.filter((r) => r.out && ruleHits(r, name, null));
  }
  if (!hits.length) return num != null ? null : "";
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

export function parseStreetNum(item: Pick<RawListing, "address" | "title">): [string, number | null] {
  let parsed = parseStreet(item.address || "");
  if (!parsed[0]) parsed = parseStreet(item.title || "");
  return parsed;
}

const PLACE_AREA_TOL = 5;

type Placeable = Pick<Listing, "address" | "title" | "area" | "ambientes" | "price">;

export function placeStreet(item: Placeable): string {
  const [name, num] = parseStreetNum(item);
  if (name && num != null) return `${name} ${num}`;
  return streetKey(item.address || "") || streetKey(item.title || "");
}

export function placeKey(item: Placeable): string {
  const street = placeStreet(item);
  if (!street || item.area == null || item.ambientes == null) return "";
  const bucket = Math.round(item.area / 5) * 5;
  return `${street}|${bucket}|${item.ambientes}`;
}

export function samePlace(a: Placeable, b: Placeable): boolean {
  const street = placeStreet(a);
  if (!street || street !== placeStreet(b)) return false;
  if (a.ambientes == null || b.ambientes == null || a.ambientes !== b.ambientes) return false;
  if (a.area == null || b.area == null) return false;
  const delta = Math.abs(a.area - b.area);
  if (delta <= PLACE_AREA_TOL) return true;
  return a.price != null && a.price === b.price;
}

function hasAreaBreakdown(item: Listing): boolean {
  return item.area_covered != null && (item.area_total != null || item.area_semi != null);
}

function mergeCluster(arr: Listing[]): Listing {
  const ranked = [...arr].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const ba = Number(hasAreaBreakdown(a));
    const bb = Number(hasAreaBreakdown(b));
    if (bb !== ba) return bb - ba;
    const ca = Number(a.area_covered != null);
    const cb = Number(b.area_covered != null);
    if (cb !== ca) return cb - ca;
    if (Boolean(a.photo) !== Boolean(b.photo)) return a.photo ? -1 : 1;
    return rankByScore(a, b);
  });
  const primary = ranked[0];
  return {
    ...primary,
    ids: arr.map((x) => x.id),
    mirrors: ranked.slice(1).map((x) => ({
      id: x.id,
      site: x.site,
      url: x.url,
      price: x.price,
    })),
  };
}

export function clusterListings(items: Listing[]): Listing[] {
  const leftover: Listing[] = [];
  const byBlock = new Map<string, Listing[]>();
  for (const item of items) {
    const street = placeStreet(item);
    if (!street || item.area == null || item.ambientes == null) {
      leftover.push({ ...item, ids: item.ids?.length ? item.ids : [item.id], mirrors: item.mirrors || [] });
      continue;
    }
    const block = `${street}|${item.ambientes}`;
    const arr = byBlock.get(block) || [];
    arr.push(item);
    byBlock.set(block, arr);
  }
  const clustered: Listing[] = [];
  for (const pool of byBlock.values()) {
    const parent = pool.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (samePlace(pool[i], pool[j])) parent[find(j)] = find(i);
      }
    }
    const groups = new Map<number, Listing[]>();
    for (let i = 0; i < pool.length; i++) {
      const root = find(i);
      const arr = groups.get(root) || [];
      arr.push(pool[i]);
      groups.set(root, arr);
    }
    for (const arr of groups.values()) clustered.push(mergeCluster(arr));
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
  const [, num] = parseStreetNum(item);
  if (num != null) return false;
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

export function listingTier(item: Listing | number): (typeof TIERS)[number] {
  if (typeof item === "number") {
    return TIERS.find((t) => item >= t.min) ?? TIERS[TIERS.length - 1];
  }
  const n = item.neto_hard_usd;
  if (n == null) return TIERS[TIERS.length - 1];
  if (n >= NETO_HARD_MEJOR_USD) return TIERS[0];
  if (n >= NETO_HARD_BIEN_USD) return TIERS[1];
  if (n >= NETO_HARD_OK_USD) return TIERS[2];
  return TIERS[3];
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
  const na = a.neto_hard_usd ?? -1e12;
  const nb = b.neto_hard_usd ?? -1e12;
  if (nb !== na) return nb - na;
  const aa = a.air_usd ?? -1e12;
  const ba = b.air_usd ?? -1e12;
  if (ba !== aa) return ba - aa;
  const ds = (b.score || 0) - (a.score || 0);
  if (ds) return ds;
  return (a.price ?? 1e12) - (b.price ?? 1e12);
}
