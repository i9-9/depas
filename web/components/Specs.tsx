import type { Listing } from "@/lib/listings";

export type Spec = { label: string; value: string };

export function specsOf(item: Listing): Spec[] {
  const rows: Spec[] = [];
  if (item.area != null) rows.push({ label: "m²", value: item.area.toLocaleString("es-AR") });
  if (item.ambientes != null) rows.push({ label: "Amb", value: String(item.ambientes) });
  if (item.zone) rows.push({ label: "Barrio", value: item.zone });
  if (item.piso != null) rows.push({ label: "Piso", value: item.piso === 0 ? "PB" : String(item.piso) });
  if (item.expensas_ars != null) {
    rows.push({ label: "Exp.", value: item.expensas_ars.toLocaleString("es-AR") });
  }
  if (item.antiguedad_years != null) {
    rows.push({
      label: "Años",
      value: item.antiguedad_years === 0 ? "0" : String(item.antiguedad_years),
    });
  }
  if (item.cochera === true) rows.push({ label: "Coch.", value: "sí" });
  if (item.cochera === false) rows.push({ label: "Coch.", value: "no" });
  return rows;
}

export function Specs({ item }: { item: Listing }) {
  const rows = specsOf(item);
  if (!rows.length) {
    return <p className="text-[13px] text-muted">El listado no trae metros, ambientes ni barrio.</p>;
  }
  return (
    <dl className="grid grid-cols-2 border-y border-line">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 border-b border-line py-2 pr-4 last:border-b-0">
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">{row.label}</dt>
          <dd className="idx text-right text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function specsCells(item: Listing): { m2: string; amb: string; zone: string } {
  return {
    m2: item.area != null ? item.area.toLocaleString("es-AR") : "s/d",
    amb: item.ambientes != null ? String(item.ambientes) : "s/d",
    zone: item.zone || "s/d",
  };
}
