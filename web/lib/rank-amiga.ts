import type { Amiga } from "@/lib/load-amiga";

export type Ranked = { item: Amiga; score: number; reasons: string[]; flags: string[] };

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

/**
 * Ordena por cuánto cumple lo que pidió Mailén. Solo usa lo que dice el aviso:
 * lo que no aparece no suma ni resta (se mira en la visita).
 */
export function rankAmiga(rows: Amiga[]): Ranked[] {
  const ppm = (r: Amiga) => (r.price && (r.area_covered ?? r.area) ? r.price / (r.area_covered ?? r.area)! : null);
  const med = median(rows.map(ppm).filter((x): x is number => x != null));

  const ranked = rows.map((item) => {
    const text = fold(`${item.title} ${item.blurb}`);
    let score = 0;
    const reasons: string[] = [];
    const flags: string[] = [];
    const add = (pts: number, label: string) => {
      score += pts;
      (pts >= 0 ? reasons : flags).push(label);
    };

    // Orientación
    const o = text.match(/orientacion\s+(?:al\s+)?(norte|noreste|noroeste|nordeste|sur|sureste|suroeste|este|oeste)/);
    if (o) {
      if (/^(norte|noreste|noroeste|nordeste)$/.test(o[1])) add(3, `orientación ${o[1]}`);
      else if (o[1] === "este" || o[1] === "oeste") add(1, `orientación ${o[1]}`);
      else add(-2, `orientación ${o[1]}`);
    } else if (/\b(?:frente|ventanal\w*)\s+(?:al\s+)?norte\b|\bsol\s+(?:de\s+la\s+)?(?:manana|tarde|todo el dia)/.test(text)) {
      add(2, "sol / norte");
    }

    // Balcón amplio
    const bal = balconyM2(text);
    if (bal != null) {
      if (bal >= 5) add(3, `balcón ${bal.toFixed(1).replace(".", ",")} m²`);
      else if (bal >= 3) add(1, `balcón ${bal.toFixed(1).replace(".", ",")} m²`);
      else add(-1, `balcón chico (${bal.toFixed(1).replace(".", ",")} m²)`);
    } else if (/balcon\s+(?:amplio|grande|corrido|terraza)|gran\s+balcon|amplio\s+balcon|balcon\s+aterrazado/.test(text)) {
      add(2, "balcón amplio");
    } else if (/terraza|patio/.test(text)) {
      add(1, "terraza / patio");
    }

    // Vista alta
    if (item.piso === 0 || /planta baja/.test(text)) add(-3, "planta baja");
    else if (item.piso != null && item.piso >= 5) add(3, `piso ${item.piso}`);
    else if (item.piso != null && item.piso >= 3) add(1, `piso ${item.piso}`);
    if (/vista\s+(?:abierta|despejada|panoramica|al\s+(?:rio|parque|skyline))|piso\s+alto|vista\s+a\s+la\s+ciudad/.test(text)) {
      add(2, "vista abierta");
    }

    // Luz y ventanas
    if (/luminos|mucha luz|luz natural/.test(text)) add(1, "luminoso");
    if (/ventanas?\s+en\s+(?:todos|cada)|todos\s+los\s+ambientes\s+(?:con|tienen)\s+(?:ventana|luz)/.test(text)) {
      add(1, "ventanas en todos los ambientes");
    }
    if (/\binterno\b|contrafrente\s+oscuro|poca luz/.test(text)) add(-2, "interno / poca luz");

    // Pisos
    if (/parquet/.test(text) && !/sin\s+parquet/.test(text)) add(2, "parquet");
    if (/alfombra/.test(text) && !/sin\s+alfombra/.test(text)) add(-3, "alfombra");

    // Tamaño
    const m2 = item.area_covered ?? item.area;
    if (m2 != null) {
      const extra = Math.min(3, Math.max(0, Math.floor((m2 - 45) / 8)));
      if (extra > 0) add(extra, `${m2} m²`);
    }

    // Precio por m² contra el resto
    const p = ppm(item);
    if (p != null && med) {
      const pts = Math.max(-3, Math.min(3, Math.round(((med - p) / med) * 10)));
      if (pts > 0) add(pts, "buen precio por m²");
      else if (pts < 0) add(pts, "caro por m²");
    }

    // Costo y estado
    if (item.expensas_ars != null && item.expensas_ars > 250000) add(-1, "expensas altas");
    if (item.tags.includes("ocupado")) add(-3, "ocupado");
    if (item.tags.includes("barrio del aviso no coincide")) add(-2, "barrio dudoso");
    if (item.tags.includes("para reciclar")) add(-1, "para reciclar");
    if (item.tags.includes("ya hecho")) add(1, "listo para mudarse");

    return { item, score, reasons, flags };
  });

  return ranked.sort(
    (a, b) => b.score - a.score || (a.item.price ?? 1e12) - (b.item.price ?? 1e12),
  );
}
