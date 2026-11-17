import { isOnAvenue, streetOf } from "@/lib/listings";
import type { Amiga } from "@/lib/load-amiga";

export type CheckState = "si" | "parcial" | "no" | "?";

/** Un criterio de Mailén: qué dice el aviso sobre eso. "?" = se mira en la visita. */
export type Check = { id: string; label: string; state: CheckState; detail: string };

export type Verdict = "ver" | "preguntar" | "tal_vez" | "descartar";

export const VERDICT_LABEL: Record<Verdict, string> = {
  ver: "Ir a verla",
  preguntar: "Vale preguntar",
  tal_vez: "Tal vez",
  descartar: "Descartar",
};

const VERDICT_ORDER: Record<Verdict, number> = { ver: 0, preguntar: 1, tal_vez: 2, descartar: 3 };

export type PriceDrop = { from: number; to: number; pct: number };

export type Ranked = {
  item: Amiga;
  /** Puntos por lo que el aviso dice (criterios + precio + estado). */
  score: number;
  verdict: Verdict;
  /** Una frase: por qué ese veredicto y qué falta confirmar. */
  why: string;
  reasons: string[];
  flags: string[];
  checks: Check[];
  usdM2: number | null;
  /** Piso del aviso (campo o texto). */
  piso: number | null;
  /** % contra la mediana USD/m² de su barrio y ambientes; negativo = más barato. */
  valuePct: number | null;
  group: { label: string; median: number; n: number } | null;
  /** Precio muy por debajo de la mediana: puede ser un error o un problema escondido. */
  suspicious: boolean;
  /** Barato para su barrio y encima encaja. */
  opportunity: boolean;
  /** 0-100: cuánto sabemos de verdad del aviso (criterios resueltos + datos clave). */
  certainty: number;
  questions: string[];
  drop: PriceDrop | null;
  rise: PriceDrop | null;
  onAvenue: boolean;
  facets: { norte: boolean; parquet: boolean; balcon5: boolean; alto: boolean; lejosVilla: boolean };
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

const ORDINALS: Record<string, number> = {
  primer: 1, segundo: 2, tercer: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10,
};

/** Piso desde el texto: "1º piso", "piso 8", "octavo piso". Semipiso y piso alto no cuentan. */
function pisoFromText(text: string): number | null {
  const a = text.match(/\b(\d{1,2})\s*(?:º|°|ro|do|to|mo|vo|no|er|\.?°)?\s*piso\b/);
  if (a) return Number(a[1]);
  const b = text.match(/\bpiso\s+(\d{1,2})\b/);
  if (b) return Number(b[1]);
  const c = text.match(/\b(primer|segundo|tercer|cuarto|quinto|sexto|septimo|octavo|noveno|decimo)\s+piso\b/);
  return c ? ORDINALS[c[1]] : null;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** Metros para comparar precios entre avisos: el total, que casi todos informan. */
function priceArea(r: Amiga): number | null {
  return r.area_total ?? r.area ?? r.area_covered;
}

const MIN_GROUP = 5;

type Group = { label: string; median: number; n: number };

function buildGroups(rows: Amiga[]): (r: Amiga) => Group | null {
  const ppm = (r: Amiga) => {
    const a = priceArea(r);
    return r.price && a ? r.price / a : null;
  };
  const bucket = (keyOf: (r: Amiga) => string) => {
    const m = new Map<string, number[]>();
    for (const r of rows) {
      const p = ppm(r);
      if (p == null) continue;
      const k = keyOf(r);
      m.set(k, [...(m.get(k) || []), p]);
    }
    return m;
  };
  const byZoneAmb = bucket((r) => `${r.zone}|${r.ambientes}`);
  const byZone = bucket((r) => r.zone);
  const all = rows.map(ppm).filter((x): x is number => x != null);
  return (r) => {
    const a = byZoneAmb.get(`${r.zone}|${r.ambientes}`);
    if (a && a.length >= MIN_GROUP) {
      return { label: `${r.zone} · ${r.ambientes} amb`, median: median(a), n: a.length };
    }
    const z = byZone.get(r.zone);
    if (z && z.length >= MIN_GROUP) return { label: r.zone, median: median(z), n: z.length };
    return all.length ? { label: "todos los barrios", median: median(all), n: all.length } : null;
  };
}

function lastChange(r: Amiga): { from: number; to: number } | null {
  const h = r.price_history || [];
  return h.length ? h[h.length - 1] : null;
}

function joinEs(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const QUESTION: Record<string, string> = {
  orient: "¿Qué orientación tiene? Busco norte o similar.",
  balcon: "¿Cuántos m² tiene el balcón? Busco 5 m² o más.",
  ventanas: "¿Todos los ambientes tienen ventana al exterior?",
  vista: "¿En qué piso está y qué se ve desde el balcón?",
  piso: "¿Los pisos son de parquet? ¿Hay alfombras?",
  m2: "¿Cuántos m² cubiertos tiene, sin contar balcón ni terraza?",
  villa: "¿Cómo es la cuadra y el entorno? ¿Hay una villa o asentamiento cerca?",
};

/**
 * Analiza cada aviso contra lo que pidió Mailén. Solo usa lo que dice el aviso:
 * lo que no aparece no suma ni resta, queda como pregunta para la inmobiliaria.
 */
export function rankAmiga(rows: Amiga[]): Ranked[] {
  const groupOf = buildGroups(rows);

  const ranked = rows.map((item): Ranked => {
    const text = fold(`${item.title} ${item.blurb}`);
    const piso = item.piso ?? pisoFromText(text);
    let score = 0;
    const reasons: string[] = [];
    const flags: string[] = [];
    const add = (pts: number, label: string) => {
      score += pts;
      (pts >= 0 ? reasons : flags).push(label);
    };
    const checks: Check[] = [];
    const questions: string[] = [];

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
      } else {
        add(bal >= 3 ? 1 : -1, bal >= 3 ? `balcón ${fmt1(bal)} m²` : `balcón chico (${fmt1(bal)} m²)`);
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
    } else if (/\binterno\b|poca luz|contrafrente\s+oscuro|sin\s+ventana/.test(text)) {
      add(-2, "interno / poca luz");
      checks.push({ id: "ventanas", label: "Ventanas en todos los ambientes", state: "no", detail: "Habla de interno, poca luz o sin ventana" });
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
    const sinAscensor = /sin\s+ascensor|escalera\s+sin\s+ascensor|acceso\s+por\s+escalera|\bpor\s+escalera\b/.test(text);
    const conAscensor = !sinAscensor && /ascensor/.test(text);
    if (piso === 0 || /planta baja/.test(text)) {
      add(-3, "planta baja");
      checks.push({ id: "vista", label: "Vista alta", state: "no", detail: "Planta baja" });
    } else if (piso != null && piso <= 2) {
      add(-1, `piso ${piso}, bajo`);
      checks.push({ id: "vista", label: "Vista alta", state: "no", detail: `Piso ${piso}: bajo para vista alta` });
    } else if (piso != null && piso >= 5) {
      add(3, `piso ${piso}`);
      alto = true;
      if (vistaAbierta) add(2, "vista abierta");
      checks.push({ id: "vista", label: "Vista alta", state: "si", detail: `Piso ${piso}${vistaAbierta ? " · vista abierta" : ""}` });
    } else if (piso != null && piso >= 3) {
      add(1, `piso ${piso}`);
      if (vistaAbierta) {
        add(2, "vista abierta");
        alto = true;
      }
      checks.push({
        id: "vista",
        label: "Vista alta",
        state: vistaAbierta ? "si" : "parcial",
        detail: `Piso ${piso}${vistaAbierta ? " · vista abierta" : ""}`,
      });
    } else if (vistaAbierta) {
      add(2, "vista abierta");
      alto = true;
      checks.push({ id: "vista", label: "Vista alta", state: "parcial", detail: "Dice vista abierta; sin piso" });
    } else {
      checks.push({ id: "vista", label: "Vista alta", state: "?", detail: piso != null ? `Piso ${piso}` : "No dice el piso" });
    }
    // Un piso alto sin ascensor se paga todos los días.
    if (sinAscensor && (piso == null || piso >= 3)) add(-2, "sin ascensor");

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
    const m2 = item.area_covered ?? item.area;
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

    // Seguridad: cercanía a una villa o asentamiento (polígonos de OpenStreetMap)
    const vm = item.villa_m;
    const vname = item.villa_name || "una villa";
    let lejosVilla = false;
    let villaCerca = false;
    if (vm == null) {
      checks.push({
        id: "villa",
        label: "Lejos de villas",
        state: "?",
        detail: "No se pudo ubicar la dirección: mirarla en el mapa",
      });
    } else if (vm < 350) {
      villaCerca = true;
      add(-4, vm === 0 ? `dentro de ${vname}` : `a ${vm} m de ${vname}`);
      checks.push({ id: "villa", label: "Lejos de villas", state: "no", detail: vm === 0 ? `Dentro de ${vname}` : `A ${vm} m de ${vname}` });
    } else if (vm < 600) {
      add(-2, `a ${vm} m de ${vname}`);
      checks.push({ id: "villa", label: "Lejos de villas", state: "parcial", detail: `A ${vm} m de ${vname}` });
    } else {
      lejosVilla = true;
      checks.push({
        id: "villa",
        label: "Lejos de villas",
        state: "si",
        detail: `La más cercana (${vname}) queda a ${vm >= 1000 ? `${(vm / 1000).toFixed(1).replace(".", ",")} km` : `${vm} m`}`,
      });
    }

    // Precio contra su barrio y cantidad de ambientes
    const area = priceArea(item);
    const usdM2 = item.price && area ? Math.round(item.price / area) : null;
    const group = groupOf(item);
    const valuePct = usdM2 != null && group ? Math.round(((usdM2 - group.median) / group.median) * 100) : null;
    let suspicious = false;
    if (valuePct != null) {
      if (valuePct <= -28) {
        suspicious = true;
        add(1, "precio muy bajo, verificar");
      } else if (valuePct <= -10) add(3, `${-valuePct}% bajo el barrio`);
      else if (valuePct <= -4) add(2, `${-valuePct}% bajo el barrio`);
      else if (valuePct >= 12) add(-3, `${valuePct}% sobre el barrio`);
      else if (valuePct >= 4) add(-1, `${valuePct}% sobre el barrio`);
    }

    // Movimiento de precio: una baja es margen para negociar
    const ch = lastChange(item);
    let drop: PriceDrop | null = null;
    let rise: PriceDrop | null = null;
    if (ch && ch.from > 0) {
      const pct = Math.round((Math.abs(ch.to - ch.from) / ch.from) * 100);
      if (ch.to < ch.from) {
        drop = { from: ch.from, to: ch.to, pct };
        add(pct >= 5 ? 2 : 1, `bajó ${pct}%`);
      } else if (ch.to > ch.from) {
        rise = { from: ch.from, to: ch.to, pct };
        add(-1, `subió ${pct}%`);
      }
    }

    // Ruido, costo y estado
    const onAvenue = isOnAvenue(item);
    if (onAvenue) add(-1, "sobre avenida");
    if (item.expensas_ars != null && item.expensas_ars > 250000) add(-1, "expensas altas");
    if (item.tags.includes("ocupado")) add(-3, "ocupado");
    if (item.tags.includes("barrio del aviso no coincide")) add(-2, "barrio dudoso");
    if (item.tags.includes("para reciclar")) add(-1, "para reciclar");
    if (item.tags.includes("ya hecho")) add(1, "listo para mudarse");

    // Preguntas: todo lo que el aviso no resuelve
    for (const c of checks) {
      if (c.state === "?" || c.state === "parcial") {
        if (c.id === "ventanas" && c.state === "parcial") continue;
        if (c.id === "vista" && c.state === "parcial" && piso != null) continue;
        if (c.id === "orient" && c.state === "parcial" && norte) continue;
        if (QUESTION[c.id]) questions.push(QUESTION[c.id]);
      }
    }
    if (piso != null && piso >= 4 && !conAscensor && !sinAscensor) questions.push("¿Tiene ascensor?");
    if (item.expensas_ars == null) questions.push("¿Cuánto son las expensas?");
    if (item.tags.includes("ocupado")) questions.push("¿Se entrega libre de ocupantes?");
    if (!drop) questions.push("¿Hace cuánto está publicado y hay margen para negociar?");

    // Cuánto sabemos de verdad
    const known = checks.filter((c) => c.state === "si" || c.state === "no").length;
    const data = [item.area_covered != null, piso != null, item.expensas_ars != null, item.antiguedad_years != null]
      .filter(Boolean).length;
    const certainty = Math.round(((known + data) / (checks.length + 4)) * 100);

    // Veredicto
    const nos = checks.filter((c) => c.state === "no").length;
    const conAlfombra = /alfombra/.test(text) && !/sin\s+alfombra/.test(text);
    const deal =
      item.tags.includes("ocupado") || piso === 0 || /planta baja/.test(text) || conAlfombra || villaCerca;
    const opportunity = !suspicious && valuePct != null && valuePct <= -10 && score >= 5;
    let verdict: Verdict;
    // Descartar es por motivos reales; un aviso con poca info es "tal vez", no un no.
    if (deal || nos >= 2 || score < 0) verdict = "descartar";
    else if (score >= 8 && nos === 0 && (valuePct == null || valuePct <= 5) && !suspicious) verdict = "ver";
    else if (score >= 4 || opportunity) verdict = "preguntar";
    else verdict = "tal_vez";

    // La frase del veredicto: lo mejor, lo que resta y lo que falta
    const best = reasons.filter((x) => !/^\d+ m²$/.test(x)).slice(0, 3);
    const unknown = checks.filter((c) => c.state === "?").map((c) => c.label.toLowerCase());
    const parts: string[] = [];
    if (best.length) parts.push(`${best[0][0].toUpperCase()}${best[0].slice(1)}${best.length > 1 ? `, ${joinEs(best.slice(1))}` : ""}.`);
    if (flags.length) parts.push(`Resta: ${joinEs(flags.slice(0, 3))}.`);
    if (suspicious) parts.push("El precio está muy por debajo de su barrio: verificar que no haya un problema.");
    if (unknown.length) parts.push(`Falta confirmar: ${joinEs(unknown.slice(0, 3))}${unknown.length > 3 ? "…" : ""}.`);
    const why = parts.join(" ") || "Sin datos suficientes en el aviso.";

    return {
      item,
      score,
      verdict,
      why,
      reasons,
      flags,
      checks,
      usdM2,
      piso,
      valuePct,
      group,
      suspicious,
      opportunity,
      certainty,
      questions,
      drop,
      rise,
      onAvenue,
      facets: { norte, parquet, balcon5, alto, lejosVilla },
    };
  });

  return ranked.sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      b.score - a.score ||
      (a.item.price ?? 1e12) - (b.item.price ?? 1e12),
  );
}

/** Mensaje listo para pegar en WhatsApp o en el formulario del portal. */
export function questionsMessage(r: Ranked, siteName: string): string {
  const street = streetOf(r.item);
  const qs = r.questions.slice(0, 6).map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Hola! Vi el departamento de ${street}${r.item.zone ? ` (${r.item.zone})` : ""} en ${siteName} y me interesa. Quería consultar:\n${qs}\nGracias!`;
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
    const twin = k
      ? (groups.get(k) || []).find(
          (o) =>
            o.site !== r.site &&
            (o.price === r.price || (m2(o) != null && m2(r) != null && Math.abs(m2(o)! - m2(r)!) <= 5)),
        )
      : undefined;
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
    const copy = { ...r, mirrors: r.mirrors ? [...r.mirrors] : [] };
    out.push(copy);
    if (k) groups.set(k, [...(groups.get(k) || []), copy]);
  }
  return out;
}
