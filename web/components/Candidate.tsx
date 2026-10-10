import { siteLabel } from "@/lib/listings";
import { medianLine, seenLine } from "@/lib/verdict";
import type { ResolvedPick } from "@/lib/pick";
import { PricePair } from "@/components/PricePair";
import { Specs } from "@/components/Specs";
import { Verdict } from "@/components/Verdict";

export function Candidate({
  pick,
}: {
  pick: ResolvedPick;
}) {
  const item = pick.listing;
  if (!item) {
    return (
      <section className="g mt-16">
        <div className="col-span-12 md:col-span-6">
          <h1 className="display text-[48px]">Todavía no hay candidato</h1>
          <p className="mt-6 max-w-sm text-[14px]">
            Cuando el buscador encuentre un aviso que pase los filtros, aparece acá.
          </p>
        </div>
      </section>
    );
  }

  const median = medianLine(item);
  const seen = seenLine(item);
  const origin = pick.manual ? "A mano" : "Ranking";
  const place = pick.rank > 0 ? `${pick.rank}/${pick.total}` : String(pick.total);

  return (
    <article className="g mt-8 items-start">
      <div className="col-span-12 flex min-w-0 flex-col gap-8 lg:col-span-5 lg:order-1">
        <PricePair item={item} large />

        <header>
          <h1 className="display text-[32px] sm:text-[40px]">
            {item.address || item.title || "Aviso sin dirección"}
          </h1>
          <p className="idx mt-3 text-[13px]">
            {origin} {place} · {siteLabel(item.site)}
          </p>
        </header>

        <Specs item={item} />

        <Verdict data={item.verdict} />

        {pick.note ? <p>{pick.note}</p> : null}

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-solid flex min-h-12 items-center justify-center text-[14px]"
        >
          Ver aviso
        </a>

        <footer className="space-y-2 border-t border-ink pt-4 text-[12px]">
          {median && <p>{median}</p>}
          {seen && <p>{seen}</p>}
          <details>
            <summary className="cursor-pointer">Cómo se elige</summary>
            <p className="mt-2 leading-relaxed">
              Suma de época, reciclar y edificio. Pasarse de USD 125.000 resta, no saca el
              aviso. Para fijar uno: <code>web/data/pick.json</code>.
            </p>
          </details>
        </footer>
      </div>

      <div className="col-span-12 lg:col-span-7 lg:order-2">
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo} alt="" className="aspect-[4/3] w-full bg-photo object-cover" />
        ) : (
          <p className="flex aspect-[4/3] items-end border border-ink p-4 text-[13px]">Sin foto</p>
        )}
      </div>
    </article>
  );
}
