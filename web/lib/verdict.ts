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
  "expensas altas": "las expensas son altas",
  "expensas muy altas": "las expensas son muy altas",
  aire: "tiene aire para darlo vuelta",
  "aire amplio": "tiene aire amplio para darlo vuelta",
  "sin aire": "no tiene aire para la obra",
  "ya hecho": "ya está reciclado o a estrenar",
  tesis: "es el combo: buen edificio y unidad a reciclar",
  "cumple barrio, metros y balcón": "pasa barrio, metros y balcón; no hay más señales",
};

const FALTA: Record<string, string> = {
  foto: "la foto",
  expensas: "las expensas",
  piso: "el piso",
  metros: "los metros",
};

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

export function verdictOf(
  item: Pick<Listing, "tags" | "price" | "photo" | "expensas_ars" | "piso" | "area" | "air_usd" | "exit_usd_m2" | "reno_usd_m2" | "zone"> | RawListing,
): Verdict {
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
    } else if (
      t === "edificio flojo" ||
      t === "edificio a reciclar" ||
      t === "metro caro" ||
      t === "expensas altas" ||
      t === "expensas muy altas" ||
      t === "sin aire" ||
      t === "ya hecho" ||
      t === "planta baja"
    ) {
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
  const parts: string[] = [];
  if (entra.length) parts.push(`A favor: ${joinEs(entra)}.`);
  if (resta.length) parts.push(`En contra: ${joinEs(resta)}.`);
  if (falta.length) parts.push(`El aviso no dice: ${joinEs(falta)}.`);
  const air = airLine(item);
  if (air) parts.push(air);
  return { entra, resta, falta, text: parts.join(" ") };
}

export function airLine(
  item: Pick<Listing, "air_usd" | "exit_usd_m2" | "reno_usd_m2" | "zone"> | RawListing,
): string | null {
  if (item.air_usd == null || item.exit_usd_m2 == null || !item.zone) return null;
  const reno = item.reno_usd_m2 ?? RENO_USD_M2;
  return `Salida de referencia ${fmtUsd(item.exit_usd_m2)}/m² en ${item.zone}; obra de screening ${fmtUsd(reno)}/m²; aire ${fmtUsd(item.air_usd)}.`;
}

export function medianLine(item: Listing): string | null {
  if (item.usd_per_m2 == null || item.vs_median_pct == null || !item.zone || !item.vs_median_n) {
    return null;
  }
  const pct = item.vs_median_pct;
  const where = item.zone;
  const n = item.vs_median_n;
  if (pct === 0) {
    return `El metro sale lo mismo que los demás de ${where}.`;
  }
  const dir = pct < 0 ? "más barato" : "más caro";
  return `El metro está ${Math.abs(pct)}% ${dir} que los demás de ${where}.`;
}

export function seenLine(item: Listing): string | null {
  const days = item.days_seen;
  if (days == null) return null;
  const when = days === 0 ? "hoy" : days === 1 ? "hace 1 día" : `hace ${days} días`;
  const drops = item.price_drops || 0;
  if (drops === 0) return `Está en la lista desde ${when}.`;
  const dropTxt = drops === 1 ? "bajó una vez" : `bajó ${drops} veces`;
  return `Está en la lista desde ${when} y ${dropTxt}.`;
}
