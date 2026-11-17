import { Photo } from "@/components/Photo";
import { formatNum, streetOf } from "@/lib/listings";
import type { Amiga as AmigaRow } from "@/lib/load-amiga";
import { rankAmiga, type Ranked } from "@/lib/rank-amiga";

const SITE: Record<string, string> = {
  zonaprop: "Zonaprop",
  argenprop: "Argenprop",
  mercadolibre: "Mercado Libre",
  cabaprop: "Cabaprop",
};

const BARRIOS =
  "Villa General Mitre, Villa Santa Rita, Villa del Parque, Agronomía, Paternal, Almagro, Boedo, Parque Chacabuco, Villa Crespo y Caballito";

const VISITA = [
  "Orientación norte o similar",
  "Balcón amplio (mínimo 5 m²)",
  "Ventanas en todos los ambientes",
  "Vista alta",
  "Pisos de parquet, sin alfombras",
];

export function Amiga({ rows }: { rows: AmigaRow[] }) {
  const list = rankAmiga(rows);
  return (
    <section className="mt-10">
      <p className="kicker text-muted">Aparte de la cuenta</p>
      <h1 className="display mt-3 text-title">Para Mailén</h1>
      <p className="lede mt-4 max-w-xl text-ink">
        2 o 3 ambientes con balcón y luz, hasta USD 100.000, desde 45 m² cubiertos. Barrios: {BARRIOS}.
        Ordenados de mejor a peor según lo que pidió: orientación, balcón, vista alta, parquet, luz, metros y precio por m². Lo que el aviso no dice no suma ni resta.
      </p>
      <p className="mt-6 text-[0.8125rem] font-bold text-title">A mirar en la visita (el portal no lo dice)</p>
      <ul className="mt-2 text-[0.8125rem] leading-snug text-muted">
        {VISITA.map((v) => (
          <li key={v}>· {v}</li>
        ))}
      </ul>
      {list.length ? (
        <ul className="mt-10 border-t border-line">
          {list.map((r, i) => (
            <li key={r.item.id}>
              <Row ranked={r} pos={i + 1} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="lede mt-10 text-muted">Todavía no hay ninguno en esta vuelta.</p>
      )}
    </section>
  );
}

function Row({ ranked, pos }: { ranked: Ranked; pos: number }) {
  const { item, score, reasons, flags } = ranked;
  const street = streetOf(item);
  const covered = item.area_covered != null;
  const meters = covered ? item.area_covered : item.area;
  const bits = [
    meters != null ? `${meters.toLocaleString("es-AR")} m² ${covered ? "cubiertos" : "totales"}` : null,
    item.ambientes != null ? `${item.ambientes} ambientes` : null,
    item.piso != null ? (item.piso === 0 ? "planta baja" : `piso ${item.piso}`) : null,
    item.antiguedad_years != null ? `${item.antiguedad_years} años` : null,
    item.expensas_ars != null ? `expensas $ ${formatNum(item.expensas_ars)}` : null,
  ].filter(Boolean);
  return (
    <article className="grid grid-cols-1 gap-4 border-b border-line py-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <Photo src={item.photo} alt="" className="aspect-[4/3] w-full" />
      <div className="min-w-0">
        <p className="kicker text-muted">
          #{pos} · {item.zone || "CABA"} · {SITE[item.site] || item.site} · {score} pts
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
        {reasons.length ? <p className="mt-2 text-[0.8125rem] text-ink">+ {reasons.join(" · ")}</p> : null}
        {flags.length ? <p className="mt-1 text-[0.8125rem] text-muted">− {flags.join(" · ")}</p> : null}
      </div>
    </article>
  );
}
