import { AmigaCatalog } from "@/components/AmigaCatalog";
import type { Amiga as AmigaRow } from "@/lib/load-amiga";

const BARRIOS =
  "Villa General Mitre, Villa Santa Rita, Villa del Parque, Agronomía, Paternal, Almagro, Boedo, Parque Chacabuco, Villa Crespo y Caballito";

const PEDIDO = [
  "Orientación norte o similar",
  "Balcón amplio (mínimo 5 m²)",
  "Ventanas en todos los ambientes",
  "Vista alta",
  "Parquet, sin alfombras",
  "Mínimo 45 m² cubiertos",
  "2 o 3 ambientes",
  "Hasta USD 100.000",
];

export function Amiga({ rows, lastChange }: { rows: AmigaRow[]; lastChange: string | null }) {
  return (
    <section className="mt-10">
      <p className="kicker text-muted">Aparte de la cuenta</p>
      <h1 className="display mt-3 text-title">Para Mailén</h1>
      <p className="lede mt-4 max-w-xl text-ink">
        {rows.length} departamentos de 2 y 3 ambientes con balcón, de Zonaprop y Cabaprop, ordenados de mejor a peor
        según lo que pidió.
      </p>
      <details className="mt-3 max-w-xl">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[0.8125rem] font-bold text-title underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          Qué se busca y cómo se ordena
        </summary>
        <ul className="text-[0.8125rem] leading-snug text-muted">
          {PEDIDO.map((v) => (
            <li key={v}>· {v}</li>
          ))}
        </ul>
        <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
          Barrios: {BARRIOS}. El orden suma por orientación, balcón, vista alta, parquet, luz, metros y precio por m², y
          resta por planta baja, alfombra, avenida u ocupado. Lo que el aviso no dice no suma ni resta: queda como «a
          verificar» para la visita.
        </p>
      </details>
      <div className="mt-6">
        <AmigaCatalog rows={rows} lastChange={lastChange} />
      </div>
    </section>
  );
}
