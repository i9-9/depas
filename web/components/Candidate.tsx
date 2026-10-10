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
          <h1 className="display text-[48px]">Todavía no hay un departamento</h1>
          <p className="mt-6 max-w-sm text-[14px] text-quiet">
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
      <div className="relative col-span-12 lg:order-2 lg:col-span-7">
        {item.photo ? (
          <Photo
            src={item.photo}
            alt={street}
            priority
            className="aspect-[4/3] w-full"
          />
        ) : (
          <p className="flex aspect-[4/3] items-end border border-ink p-4 text-[13px] text-quiet">
            Este aviso no trae foto
          </p>
        )}
        <SaveCandidate id={item.id} />
      </div>

      <div className="col-span-12 mt-6 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-5 lg:mt-0">
        <PricePair item={item} large />

        <header>
          <h1 className="display text-[32px] sm:text-[40px]">
            {item.address || item.title || "Aviso sin dirección"}
          </h1>
          <p className="mt-3 text-[14px] text-quiet">{why}</p>
        </header>

        <Specs item={item} />

        <Verdict data={item.verdict} />

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-solid flex min-h-12 items-center justify-center text-[14px]"
        >
          Ver en {siteLabel(item.site)}
        </a>

        <footer className="space-y-2 border-t border-ink pt-4 text-[13px] text-quiet">
          {median && <p>{median}</p>}
          {seen && <p>{seen}</p>}
          <details>
            <summary className="cursor-pointer text-ink">Por qué este</summary>
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
