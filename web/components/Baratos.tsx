import { Photo } from "@/components/Photo";
import { formatNum, streetOf } from "@/lib/listings";
import type { Barato } from "@/lib/load-baratos";

const SITE: Record<string, string> = {
  zonaprop: "Zonaprop",
  argenprop: "Argenprop",
  mercadolibre: "Mercado Libre",
  cabaprop: "Cabaprop",
};

export function Baratos({ rows }: { rows: Barato[] }) {
  const list = rows.slice().sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  return (
    <section className="mt-10">
      <p className="kicker text-muted">Aparte de la cuenta</p>
      <h1 className="display mt-3 text-title">Más baratos</h1>
      <p className="lede mt-4 max-w-xl text-ink">
        3 ambientes con balcón y luz, en Colegiales, entre USD 70.000 y USD 119.000, desde 40 m².
        No entran al candidato: Colegiales no tiene metro de salida y el precio queda debajo del piso de USD 120.000.
      </p>
      {list.length ? (
        <ul className="mt-10 border-t border-line">
          {list.map((item) => (
            <li key={item.id}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="lede mt-10 text-muted">Todavía no hay ninguno en esta vuelta.</p>
      )}
    </section>
  );
}

function Row({ item }: { item: Barato }) {
  const street = streetOf(item);
  const covered = item.area_covered != null;
  const meters = covered ? item.area_covered : item.area;
  const recycle = item.tags.includes("para reciclar");
  const bits = [
    item.zone || "Colegiales",
    meters != null ? `${meters.toLocaleString("es-AR")} m² ${covered ? "cubiertos" : "totales"}` : null,
    item.ambientes != null ? `${item.ambientes} ambientes` : null,
    item.piso != null ? (item.piso === 0 ? "planta baja" : `piso ${item.piso}`) : null,
    item.antiguedad_years != null ? `${item.antiguedad_years} años` : null,
    item.expensas_ars != null ? `expensas $ ${formatNum(item.expensas_ars)}` : null,
  ].filter(Boolean);
  const mark = recycle ? "Para refaccionar" : "Colegiales";
  return (
    <article className="grid grid-cols-1 gap-4 border-b border-line py-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <Photo src={item.photo} alt="" className="aspect-[4/3] w-full" />
      <div className="min-w-0">
        <p className="kicker text-muted">
          {mark} · {SITE[item.site] || item.site}
        </p>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="name mt-2 block text-[1.75rem] leading-tight text-title"
        >
          {street}
        </a>
        <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-[-0.03em] text-title">
          USD {formatNum(item.price)}
        </p>
        <p className="mt-3 text-[0.8125rem] text-muted">{bits.join(" · ")}</p>
      </div>
    </article>
  );
}
