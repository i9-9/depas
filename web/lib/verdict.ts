import { GUSTO_USD, RENO_USD_M2, type Listing, type RawListing, type Verdict } from "@/lib/listings";

const SAY: Record<string, string> = {
  "de época": "es de época",
  "para reciclar": "está para reciclar",
  "edificio ok": "el edificio está en buen estado",
  "edificio flojo": "el edificio está flojo",
  "edificio a reciclar": "el edificio está para reciclar",
  "planta baja": "es planta baja",
  "sobre presupuesto": "está sobre el presupuesto",
  "metro barato": "el metro está barato para el barrio",
  "metro muy barato": "el metro está muy barato para el barrio",
  "metro caro": "el metro está caro para el barrio",
  "metro sospechoso": "verificar la cuadra: precio por debajo de lo que paga la zona",
  "expensas altas": "las expensas son altas",
  "expensas muy altas": "las expensas son muy altas",
  aire: "queda margen para comprarlo, reformarlo y venderlo",
  "aire amplio": "queda bastante margen para comprarlo, reformarlo y venderlo",
  "sin aire": "al precio de hoy no alcanza para la obra y la reventa",
  "ya hecho": "ya está reciclado o a estrenar",
  tesis: "es el combo: buen edificio y unidad a reciclar",
  "zona floja": "la cuadra no paga la salida del barrio",
  "barrio del aviso no coincide": "el aviso dice un barrio; la calle es otra",
  "m² sin verificar": "los m² son totales; no vimos cubiertos",
  "incluye cochera": "el precio incluye cochera",
  ocupado: "está ocupado o se vende con renta",
  "cumple barrio, metros y balcón": "pasa barrio, metros y balcón; no hay más señales",
};

const FALTA: Record<string, string> = {
  foto: "la foto",
  expensas: "las expensas",
  piso: "el piso",
  metros: "los metros",
};

const RESTA = new Set([
  "edificio flojo",
  "edificio a reciclar",
  "metro caro",
  "metro sospechoso",
  "expensas altas",
  "expensas muy altas",
  "sin aire",
  "ya hecho",
  "planta baja",
  "zona floja",
  "barrio del aviso no coincide",
  "ocupado",
  "incluye cochera",
]);

export function joinEs(parts: string[]): string {
  const bits = parts.filter(Boolean);
  if (!bits.length) return "";
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(", ")} y ${bits[bits.length - 1]}`;
}

function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString("es-AR")}`;
}

function say(tag: string): string {
  return SAY[tag] || tag;
}

export function verdictOf(item: Listing | RawListing): Verdict {
  const tags = (item.tags || []).filter(Boolean);
  const entra: string[] = [];
  const resta: string[] = [];
  const falta: string[] = [];
  for (const t of tags) {
    if (t === "sobre presupuesto") {
      resta.push(
        item.price != null
          ? `pide ${fmtUsd(item.price)} y el gusto es ${fmtUsd(GUSTO_USD)}`
          : say(t),
      );
    } else if (t === "m² sin verificar") {
      falta.push(say(t));
    } else if (RESTA.has(t)) {
      resta.push(say(t));
    } else {
      entra.push(say(t));
    }
  }
  if (item.piso === 0 && !resta.includes("es planta baja")) resta.push(say("planta baja"));
  if (!entra.length && !resta.length) entra.push(say("cumple barrio, metros y balcón"));
  if (!item.photo) falta.push(FALTA.foto);
  if (item.expensas_ars == null) falta.push(FALTA.expensas);
  if (item.piso == null) falta.push(FALTA.piso);
  if (item.area == null) falta.push(FALTA.metros);
  falta.push("el precio de la ficha interna");
  if (item.address_unverified) falta.push("verificar la dirección");
  if ((item as Listing).zone_unverified) falta.push("la calle no confirma el barrio del aviso");
  const parts: string[] = [];
  if (entra.length) parts.push(`A favor: ${joinEs(entra)}.`);
  if (resta.length) parts.push(`En contra: ${joinEs(resta)}.`);
  if (falta.length) parts.push(`El aviso no dice: ${joinEs(falta)}.`);
  const air = airLine(item);
  if (air) parts.push(air);
  const net = netLine(item as Listing);
  if (net) parts.push(net);
  const offer = offerLine(item as Listing);
  if (offer) parts.push(offer);
  return { entra, resta, falta, text: parts.join(" ") };
}

export function airLine(
  item: Pick<Listing, "air_usd" | "exit_usd_m2" | "reno_usd_m2" | "zone"> | RawListing,
): string | null {
  if (item.air_usd == null || item.exit_usd_m2 == null || !item.zone) return null;
  const reno = item.reno_usd_m2 ?? RENO_USD_M2;
  const leftover =
    item.air_usd >= 0
      ? `quedarían ${fmtUsd(item.air_usd)}`
      : `faltarían ${fmtUsd(Math.abs(item.air_usd))}`;
  return (
    `Aire: ${leftover} si lo comprás a este precio, le hacés una obra ` +
    `(${fmtUsd(reno)}/m²) y lo vendés al metro de referencia de ${item.zone} ` +
    `(${fmtUsd(item.exit_usd_m2)}). La salida es fija por barrio, no un comparable de la cuadra.`
  );
}

export function netLine(item: Listing): string | null {
  if (item.neto_hard_usd == null) return null;
  const n = item.neto_hard_usd;
  const sign = n >= 0 ? fmtUsd(n) : `−${fmtUsd(Math.abs(n))}`;
  let text = `Neto duro ${sign}.`;
  if (item.breakeven_exit_usd_m2 != null) {
    text += ` Equilibrio ${fmtUsd(item.breakeven_exit_usd_m2)}/m².`;
  }
  return text;
}

const DECISION: Record<string, string> = {
  comprar: "Comprar",
  negociar: "Negociar",
  vigilar: "Vigilar",
  descartar: "Descartar",
};

export function offerLine(item: Listing): string | null {
  if (item.max_offer_usd == null) return null;
  let text = `Oferta máxima ${fmtUsd(item.max_offer_usd)}.`;
  if (item.decision) text += ` ${DECISION[item.decision]}.`;
  return text;
}

export function priceLine(item: Listing): string {
  return "El precio es el de la card del listado; la ficha del portal puede decir otro.";
}

export function medianLine(item: Listing): string | null {
  if (item.usd_per_m2 == null || item.vs_median_pct == null || !item.zone || !item.vs_median_n) {
    return null;
  }
  const pct = item.vs_median_pct;
  const where = item.zone;
  if (pct === 0) return `El metro sale lo mismo que los demás de ${where}.`;
  const dir = pct < 0 ? "más barato" : "más caro";
  return `El metro está ${Math.abs(pct)}% ${dir} que los demás de ${where}.`;
}

export function seenLine(item: Listing): string | null {
  const days = item.days_seen;
  if (days == null) return null;
  const when = days === 0 ? "hoy" : days === 1 ? "hace 1 día" : `hace ${days} días`;
  const drops = item.price_drops || 0;
  const seen = `Lo vimos ${when} (no es el “publicado hace” del portal).`;
  if (drops === 0) return seen;
  const dropTxt = drops === 1 ? "bajó una vez" : `bajó ${drops} veces`;
  return `${seen} ${dropTxt[0].toUpperCase()}${dropTxt.slice(1)}.`;
}

export type LegalItem = { id: string; label: string; state: "mal" | "verificar" };

export function legalItems(item: Listing): LegalItem[] {
  const tags = item.tags || [];
  const hay = `${item.title || ""} ${item.address || ""}`.toLowerCase();
  const ocupado = tags.includes("ocupado") || /inquilino|sucesi[oó]n|coti|\binterno\b/.test(hay);
  return [
    { id: "ocupado", label: "Inquilino, sucesión o unidad interna", state: ocupado ? "mal" : "verificar" },
    { id: "titulo", label: "Título, embargos e inhibiciones", state: "verificar" },
    { id: "reglamento", label: "Reglamento y planos", state: "verificar" },
    { id: "acta", label: "Constancia notarial del estado al comprar", state: "verificar" },
    { id: "ganancias", label: "Ganancia cedular y habitualidad (el ITI está derogado)", state: "verificar" },
    { id: "iibb", label: "Ingresos Brutos de la jurisdicción", state: "verificar" },
  ];
}
