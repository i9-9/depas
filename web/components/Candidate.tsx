import { streetOf } from "@/lib/listings";
import type { ResolvedPick } from "@/lib/pick";
import { Ficha } from "@/components/Ficha";
import { Photo } from "@/components/Photo";
import { SaveCandidate } from "@/components/SaveCandidate";

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
            Cuando aparezca uno en Recoleta o cerca, con los metros y el
            balcón, lo vas a ver acá.
          </p>
        </div>
      </section>
    );
  }

  const street = streetOf(item);
  const why =
    pick.manual && pick.note
      ? pick.note
      : `De los ${pick.total} que hay, este es el que más encaja.`;

  return (
    <article className="g mt-8 items-start">
      <div className="col-span-12 lg:sticky lg:top-4 lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:self-start">
        <div className="card relative">
          {item.photo ? (
            <Photo src={item.photo} alt={street} priority className="aspect-[4/3] w-full" />
          ) : (
            <p className="flex aspect-[4/3] items-end p-4 text-muted">Este aviso no trae foto</p>
          )}
          <SaveCandidate id={item.id} ids={item.ids} />
        </div>
      </div>
      <div className="col-span-12 min-w-0 lg:col-span-5 lg:col-start-1 lg:row-start-1">
        <Ficha item={item} variant="page" why={why} />
      </div>
    </article>
  );
}
