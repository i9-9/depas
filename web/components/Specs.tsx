import type { Listing } from "@/lib/listings";

export type Spec = { label: string; value: string };

export function specsOf(item: Listing): Spec[] {
  const rows: Spec[] = [];
  if (item.area != null) rows.push({ label: "Metros", value: `${item.area.toLocaleString("es-AR")} m²` });
  if (item.air_usd != null) {
    rows.push({
      label: "Aire",
      value: `${item.air_usd >= 0 ? "" : "−"}USD ${Math.abs(item.air_usd).toLocaleString("es-AR")}`,
    });
  }
  if (item.ambientes != null) rows.push({ label: "Ambientes", value: String(item.ambientes) });
  if (item.zone) rows.push({ label: "Barrio", value: item.zone });
  if (item.piso != null) rows.push({ label: "Piso", value: item.piso === 0 ? "Planta baja" : String(item.piso) });
  if (item.expensas_ars != null && item.expensas_ars >= 10000) {
    rows.push({ label: "Expensas", value: `$${item.expensas_ars.toLocaleString("es-AR")}` });
  }
  if (item.antiguedad_years != null) {
    rows.push({
      label: "Antigüedad",
      value: item.antiguedad_years === 0 ? "A estrenar" : `${item.antiguedad_years} años`,
    });
  }
  if (item.cochera === true) rows.push({ label: "Cochera", value: "Sí" });
  if (item.cochera === false) rows.push({ label: "Cochera", value: "No" });
  return rows;
}

export function Specs({ item }: { item: Listing }) {
  const rows = specsOf(item);
  if (!rows.length) {
    return <p className="text-ink">El aviso no dice metros, ambientes ni barrio.</p>;
  }
  return (
    <dl className="border-y border-line">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-b-0"
        >
          <dt className="text-muted">{row.label}</dt>
          <dd className="idx text-right text-title">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function specsCells(item: Listing): { m2: string; amb: string; zone: string } {
  return {
    m2: item.area != null ? item.area.toLocaleString("es-AR") : "—",
    amb: item.ambientes != null ? String(item.ambientes) : "—",
    zone: item.zone || "—",
  };
}

const ROW_SPECS = new Set(["Metros", "Ambientes", "Barrio"]);

export function extraSpecsOf(item: Listing): Spec[] {
  return specsOf(item).filter((row) => !ROW_SPECS.has(row.label));
}
