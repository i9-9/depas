import { EXPENSAS_MIN_VALID_ARS, type Listing } from "@/lib/listings";

export type Fact = {
  label: string;
  value: string;
  hint?: string;
  tone?: "signal" | "title";
};

function signed(n: number): string {
  const body = Math.abs(n).toLocaleString("es-AR");
  return n < 0 ? `−${body}` : `+${body}`;
}

export function placeFacts(item: Listing): Fact[] {
  let metersHint: string | undefined;
  if (item.area_covered != null && item.area_total != null && item.area_covered !== item.area_total) {
    metersHint = `${item.area_covered.toLocaleString("es-AR")} cub. · ${item.area_total.toLocaleString("es-AR")} tot.`;
  } else if ((item.tags || []).includes("m² sin verificar")) {
    metersHint = "sin cubiertos";
  }
  const pct = item.vs_median_pct;
  const suspect = (item.tags || []).includes("metro sospechoso");
  let vs = "—";
  let vsHint: string | undefined;
  let vsTone: Fact["tone"] = "title";
  if (pct != null) {
    vs = pct === 0 ? "0%" : `${pct < 0 ? "−" : "+"}${Math.abs(pct)}%`;
    vsHint = pct < 0 ? "más barato" : pct > 0 ? "más caro" : "igual";
    if (pct < 0 && !suspect) vsTone = "signal";
  }
  return [
    {
      label: "Metros",
      value: item.area != null ? `${item.area.toLocaleString("es-AR")} m²` : "—",
      hint: metersHint,
    },
    { label: "Ambientes", value: item.ambientes != null ? String(item.ambientes) : "—" },
    {
      label: "El m²",
      value: item.usd_per_m2 != null ? item.usd_per_m2.toLocaleString("es-AR") : "—",
      hint: item.usd_per_m2 != null ? "USD" : undefined,
    },
    { label: "Vs. el barrio", value: vs, hint: vsHint, tone: vs === "—" ? undefined : vsTone },
  ];
}

export function dealFacts(item: Listing): Fact[] {
  const parked = (item.tags || []).includes("incluye cochera") ? "incluye cochera" : undefined;
  const rows: Fact[] = [
    {
      label: "Neto duro",
      value: item.neto_hard_usd != null ? signed(item.neto_hard_usd) : "—",
      hint: item.neto_hard_usd != null ? "USD" : parked,
      tone: item.neto_hard_usd != null && item.neto_hard_usd >= 0 ? "signal" : "title",
    },
    {
      label: "Aire",
      value: item.air_usd != null ? signed(item.air_usd) : "—",
      hint: item.air_usd != null ? "USD" : parked,
      tone: item.air_usd != null && item.air_usd >= 0 ? "signal" : "title",
    },
    {
      label: "Expensas",
      value:
        item.expensas_ars != null && item.expensas_ars >= EXPENSAS_MIN_VALID_ARS
          ? `$${item.expensas_ars.toLocaleString("es-AR")}`
          : "—",
    },
    {
      label: "Piso",
      value: item.piso == null ? "—" : item.piso === 0 ? "Planta baja" : String(item.piso),
    },
  ];
  if (item.antiguedad_years != null) {
    rows.push({
      label: "Antigüedad",
      value: item.antiguedad_years === 0 ? "A estrenar" : `${item.antiguedad_years} años`,
    });
  }
  if (item.cochera != null) {
    rows.push({ label: "Cochera", value: item.cochera ? "Sí" : "No" });
  }
  return rows;
}

export function specsCells(item: Listing): { m2: string; amb: string; zone: string } {
  return {
    m2: item.area != null ? item.area.toLocaleString("es-AR") : "—",
    amb: item.ambientes != null ? String(item.ambientes) : "—",
    zone: item.zone || "—",
  };
}

