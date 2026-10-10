import { siteLabel, streetOf } from "@/lib/listings";
import { medianLine, seenLine } from "@/lib/verdict";
import type { ResolvedPick } from "@/lib/pick";
import { Photo } from "@/components/Photo";
import { PricePair } from "@/components/PricePair";
import { SaveCandidate } from "@/components/SaveCandidate";
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
          <h1 className="display text-title">Todavía no hay un departamento</h1>
          <p className="measure mt-6 text-ink">
            Cuando aparezca uno que pase barrio, metros y balcón, lo vas a ver
            acá.
          </p>
        </div>
      </section>
    );
  }

  const median = medianLine(item);
  const seen = seenLine(item);
  const street = streetOf(item);
  const why =
    pick.manual && pick.note
      ? pick.note
      : `El que más encaja ahora, de ${pick.total} avisos.`;

  return (
    <article className="g mt-6 items-start">
      <div className="card relative col-span-12 lg:order-2 lg:col-span-7">
        {item.photo ? (
          <div className="overflow-hidden">
            <Photo
              src={item.photo}
              alt={street}
              priority
              className="aspect-[4/3] w-full"
            />
          </div>
        ) : (
          <p className="flex aspect-[4/3] items-end p-4 text-[0.8125rem] text-muted">
            Este aviso no trae foto
          </p>
        )}
        <SaveCandidate id={item.id} ids={item.ids} />
      </div>

      <div className="col-span-12 mt-6 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-5 lg:mt-0">
        <PricePair item={item} large />

        <header>
          <h1 className="display text-title">
            {item.address || item.title || "Aviso sin dirección"}
          </h1>
          <p className="measure mt-3 text-ink">{why}</p>
        </header>

        <Specs item={item} />

        <Verdict data={item.verdict} />

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-solid self-start"
        >
          Ver aviso · {siteLabel(item.site)}
        </a>
        {item.mirrors.map((m) => (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            También en {siteLabel(m.site)}
            {m.price != null ? ` · USD ${m.price.toLocaleString("es-AR")}` : ""}
          </a>
        ))}

        <footer className="measure space-y-2 border-t border-line pt-4 text-[0.8125rem] text-ink">
          {median && <p>{median}</p>}
          {seen && <p>{seen}</p>}
          <details>
            <summary className="link flex min-h-11 cursor-pointer items-center text-ink">Por qué este</summary>
            <p className="mt-2 leading-relaxed">
              Sumamos si es de época, si está para reciclar o si el edificio
              está bien. Pasarse de USD 125.000 resta, no lo saca. El resto de
              avisos está en la lista, para marcar favoritos.
            </p>
          </details>
        </footer>
      </div>
    </article>
  );
}
