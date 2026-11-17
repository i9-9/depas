import { isOnAvenue, streetOf } from "@/lib/listings";
import type { Amiga } from "@/lib/load-amiga";

export type CheckState = "si" | "parcial" | "no" | "?";

/** Un criterio de Mailén: qué dice el aviso sobre eso. "?" = se mira en la visita. */
export type Check = { id: string; label: string; state: CheckState; detail: string };

export type Ranked = {
  item: Amiga;
  score: number;
  tier: "top" | "buena" | "regular" | "floja";
  reasons: string[];
  flags: string[];
  checks: Check[];
  usdM2: number | null;
  onAvenue: boolean;
  facets: { norte: boolean; parquet: boolean; balcon5: boolean; alto: boolean };
};

export const TIER_LABEL: Record<Ranked["tier"], string> = {
  top: "Muy buena",
  buena: "Buena",
  regular: "Regular",
  floja: "Floja",
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function num(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

/** Metros del balcón si el texto trae "balcón ... 3,30 x 1,30". */
function balconyM2(text: string): number | null {
  const m = text.match(/balcon[^.]{0,90}?(\d+(?:,\s?\d+)?)\s*(?:m|mts|metros)?\s*x\s*(\d+(?:,\s?\d+)?)/);
  if (!m) return null;
  const a = num(m[1]) * num(m[2]);
  return Number.isFinite(a) && a > 0 && a < 60 ? a : null;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function tierOf(score: number): Ranked["tier"] {
  if (score >= 8) return "top";
  if (score >= 5) return "buena";
  if (score >= 2) return "regular";
  return "floja";
}

/**
 * Ordena por cuánto cumple lo que pidió Mailén. Solo usa lo que dice el aviso:
 * lo que no aparece no suma ni resta (se mira en la visita).
 */
export function rankAmiga(rows: Amiga[]): Ranked[] {
  const m2Of = (r: Amiga) => r.area_covered ?? r.area;
  const ppm = (r: Amiga) => {
    const m2 = m2Of(r);
    return r.price && m2 ? r.price / m2 : null;
  };
  const med = median(rows.map(ppm).filter((x): x is number => x != null));

  const ranked = rows.map((item): Ranked => {
    const text = fold(`${item.title} ${item.blurb}`);
    let score = 0;
    const reasons: string[] = [];
    const flags: string[] = [];
    const add = (pts: number, label: string) => {
      score += pts;
      (pts >= 0 ? reasons : flags).push(label);
    };
    const checks: Check[] = [];

    // Orientación
    const o = text.match(/orientacion\s+(?:al\s+)?(norte|noreste|noroeste|nordeste|sur|sureste|suroeste|este|oeste)/);
    let norte = false;
    if (o) {
      if (/^(norte|noreste|noroeste|nordeste)$/.test(o[1])) {
        add(3, `orientación ${o[1]}`);
        norte = true;
        checks.push({ id: "orient", label: "Orientación norte o similar", state: "si", detail: `El aviso dice ${o[1]}` });
      } else if (o[1] === "este" || o[1] === "oeste") {
        add(1, `orientación ${o[1]}`);
        checks.push({ id: "orient", label: "Orientación norte o similar", state: "parcial", detail: `El aviso dice ${o[1]}` });
      } else {
        add(-2, `orientación ${o[1]}`);
        checks.push({ id: "orient", label: "Orientación norte o similar", state: "no", detail: `El aviso dice ${o[1]}` });
      }
    } else if (/\b(?:frente|ventanal\w*)\s+(?:al\s+)?norte\b|\bsol\s+(?:de\s+la\s+)?(?:manana|tarde|todo el dia)/.test(text)) {
      add(2, "sol / norte");
      norte = true;
      checks.push({ id: "orient", label: "Orientación norte o similar", state: "parcial", detail: "Menciona sol o norte" });
    } else {
      checks.push({ id: "orient", label: "Orientación norte o similar", state: "?", detail: "No lo dice: mirar con brújula" });
    }

    // Balcón amplio
    const bal = balconyM2(text);
    let balcon5 = false;
    if (bal != null) {
      if (bal >= 5) {
        add(3, `balcón ${fmt1(bal)} m²`);
        balcon5 = true;
        checks.push({ id: "balcon", label: "Balcón de 5 m² o más", state: "si", detail: `Medidas del aviso: ${fmt1(bal)} m²` });
      } else if (bal >= 3) {
        add(1, `balcón ${fmt1(bal)} m²`);
        checks.push({ id: "balcon", label: "Balcón de 5 m² o más", state: "no", detail: `Medidas del aviso: ${fmt1(bal)} m²` });
      } else {
        add(-1, `balcón chico (${fmt1(bal)} m²)`);
        checks.push({ id: "balcon", label: "Balcón de 5 m² o más", state: "no", detail: `Medidas del aviso: ${fmt1(bal)} m²` });
      }
    } else if (/balcon\s+(?:amplio|grande|corrido|terraza)|gran\s+balcon|amplio\s+balcon|balcon\s+aterrazado/.test(text)) {
      add(2, "balcón amplio");
      balcon5 = true;
      checks.push({ id: "balcon", label: "Balcón de 5 m² o más", state: "parcial", detail: "Dice amplio, sin medidas" });
    } else {
      if (/terraza|patio/.test(text)) add(1, "terraza / patio");
      checks.push({ id: "balcon", label: "Balcón de 5 m² o más", state: "?", detail: "Tiene balcón; falta medirlo" });
    }

    // Ventanas en todos los ambientes
    if (/ventanas?\s+en\s+(?:todos|cada)|todos\s+los\s+ambientes\s+(?:con|tienen)\s+(?:ventana|luz)/.test(text)) {
      add(1, "ventanas en todos los ambientes");
      checks.push({ id: "ventanas", label: "Ventanas en todos los ambientes", state: "si", detail: "El aviso lo dice" });
    } else if (/\binterno\b|poca luz|contrafrente\s+oscuro/.test(text)) {
      add(-2, "interno / poca luz");
      checks.push({ id: "ventanas", label: "Ventanas en todos los ambientes", state: "no", detail: "Habla de interno o poca luz" });
    } else if (/luminos|mucha luz|luz natural/.test(text)) {
      add(1, "luminoso");
      checks.push({ id: "ventanas", label: "Ventanas en todos los ambientes", state: "parcial", detail: "Dice luminoso; revisar cada ambiente" });
    } else {
      checks.push({ id: "ventanas", label: "Ventanas en todos los ambientes", state: "?", detail: "No lo dice" });
    }

    // Vista alta
    let alto = false;
    const vistaAbierta =
      /vista\s+(?:abierta|despejada|panoramica|al\s+(?:rio|parque|skyline))|piso\s+alto|vista\s+a\s+la\s+ciudad/.test(text);
    if (item.piso === 0 || /planta baja/.test(text)) {
      add(-3, "planta baja");
      checks.push({ id: "vista", label: "Vista alta", state: "no", detail: "Planta baja" });
    } else if (item.piso != null && item.piso >= 5) {
      add(3, `piso ${item.piso}`);
      alto = true;
      if (vistaAbierta) add(2, "vista abierta");
      checks.push({ id: "vista", label: "Vista alta", state: "si", detail: `Piso ${item.piso}${vistaAbierta ? " · vista abierta" : ""}` });
    } else if (item.piso != null && item.piso >= 3) {
      add(1, `piso ${item.piso}`);
      if (vistaAbierta) {
        add(2, "vista abierta");
        alto = true;
      }
      checks.push({
        id: "vista",
        label: "Vista alta",
        state: vistaAbierta ? "si" : "parcial",
        detail: `Piso ${item.piso}${vistaAbierta ? " · vista abierta" : ""}`,
      });
    } else if (vistaAbierta) {
      add(2, "vista abierta");
      alto = true;
      checks.push({ id: "vista", label: "Vista alta", state: "parcial", detail: "Dice vista abierta; sin piso" });
    } else {
      checks.push({ id: "vista", label: "Vista alta", state: "?", detail: item.piso != null ? `Piso ${item.piso}` : "No dice el piso" });
    }

    // Pisos
    let parquet = false;
    if (/alfombra/.test(text) && !/sin\s+alfombra/.test(text)) {
      add(-3, "alfombra");
      checks.push({ id: "piso", label: "Parquet, sin alfombras", state: "no", detail: "Menciona alfombra" });
    } else if (/parquet/.test(text) && !/sin\s+parquet/.test(text)) {
      add(2, "parquet");
      parquet = true;
      checks.push({ id: "piso", label: "Parquet, sin alfombras", state: "si", detail: "El aviso dice parquet" });
    } else {
      checks.push({ id: "piso", label: "Parquet, sin alfombras", state: "?", detail: "No lo dice" });
    }

    // Tamaño
    const m2 = m2Of(item);
    if (m2 != null) {
      const extra = Math.min(3, Math.max(0, Math.floor((m2 - 45) / 8)));
      if (extra > 0) add(extra, `${m2} m²`);
    }
    if (item.area_covered != null) {
      checks.push({
        id: "m2",
        label: "45 m² cubiertos o más",
        state: item.area_covered >= 45 ? "si" : "no",
        detail: `${item.area_covered} m² cubiertos`,
      });
    } else {
      checks.push({
        id: "m2",
        label: "45 m² cubiertos o más",
        state: "?",
        detail: item.area != null ? `Solo informa ${item.area} m² totales` : "Sin metros",
      });
    }

    // Precio por m² contra el resto
    const p = ppm(item);
    if (p != null && med) {
      const pts = Math.max(-3, Math.min(3, Math.round(((med - p) / med) * 10)));
      if (pts > 0) add(pts, "buen precio por m²");
      else if (pts < 0) add(pts, "caro por m²");
    }

    // Ruido, costo y estado
    const onAvenue = isOnAvenue(item);
    if (onAvenue) add(-1, "sobre avenida");
    if (item.expensas_ars != null && item.expensas_ars > 250000) add(-1, "expensas altas");
    if (item.tags.includes("ocupado")) add(-3, "ocupado");
    if (item.tags.includes("barrio del aviso no coincide")) add(-2, "barrio dudoso");
    if (item.tags.includes("para reciclar")) add(-1, "para reciclar");
    if (item.tags.includes("ya hecho")) add(1, "listo para mudarse");

    return {
      item,
      score,
      tier: tierOf(score),
      reasons,
      flags,
      checks,
      usdM2: p != null ? Math.round(p) : null,
      onAvenue,
      facets: { norte, parquet, balcon5, alto },
    };
  });

  return ranked.sort((a, b) => b.score - a.score || (a.item.price ?? 1e12) - (b.item.price ?? 1e12));
}

/** Mismo depto en dos portales: misma calle y altura, y mismo precio o metros parecidos. */
export function dedupeAmiga(rows: Amiga[]): Amiga[] {
  const key = (r: Amiga) => {
    const street = fold(streetOf(r)).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return /\d{2,5}/.test(street) ? `${street}|${r.ambientes ?? ""}` : null;
  };
  const m2 = (r: Amiga) => r.area_covered ?? r.area;
  const groups = new Map<string, Amiga[]>();
  const out: Amiga[] = [];
  for (const r of rows) {
    const k = key(r);
    const twin = k ? (groups.get(k) || []).find(
      (o) =>
        o.site !== r.site &&
        (o.price === r.price || (m2(o) != null && m2(r) != null && Math.abs(m2(o)! - m2(r)!) <= 5)),
    ) : undefined;
    if (twin) {
      twin.mirrors = [...(twin.mirrors || []), { site: r.site, url: r.url }];
      // Si el espejo trae metros cubiertos y el principal no, nos quedamos con esos datos.
      if (twin.area_covered == null && r.area_covered != null) {
        twin.area_covered = r.area_covered;
        twin.area_total = r.area_total ?? twin.area_total;
      }
      if (!twin.photo && r.photo) twin.photo = r.photo;
      continue;
    }
    const copy = { ...r, mirrors: [] as { site: string; url: string }[] };
    out.push(copy);
    if (k) groups.set(k, [...(groups.get(k) || []), copy]);
  }
  return out;
}
