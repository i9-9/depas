import { streetOf, type Listing } from "@/lib/listings";
import type { ResolvedPick } from "@/lib/pick";
import { Ficha } from "@/components/Ficha";
import { Photo } from "@/components/Photo";
import { SaveCandidate } from "@/components/SaveCandidate";

export function Candidate({ pick }: { pick: ResolvedPick }) {
  const item = pick.listing;
  if (!item) {
    return (
      <section className="g mt-16">
        <div className="col-span-12 md:col-span-6">
          <h1 className="display text-title">Todavía no hay un candidato</h1>
          <p className="measure mt-6 text-ink">{pick.why}</p>
          {pick.aside ? <p className="measure mt-4 text-muted">{pick.aside}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <Card item={item} why={pick.why} mark={pick.thesis ? "El número" : null} />
      {pick.thesis ? (
        <Card
          item={pick.thesis}
          why={pick.thesisWhy}
          mark="La tesis"
          level="h2"
          className="mt-16 border-t border-line pt-10"
        />
      ) : null}
      {pick.aside ? <p className="measure mt-10 text-muted">{pick.aside}</p> : null}
    </>
  );
}

function Card({
  item,
  why,
  mark,
  level = "h1",
  className = "mt-8",
}: {
  item: Listing;
  why: string;
  mark?: string | null;
  level?: "h1" | "h2";
  className?: string;
}) {
  const street = streetOf(item);
  return (
    <article className={`g items-start ${className}`}>
      <div className="col-span-12 lg:sticky lg:top-4 lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:self-start">
        <div className="card relative">
          {item.photo ? (
            <Photo src={item.photo} alt={street} priority={level === "h1"} className="aspect-[4/3] w-full" />
          ) : (
            <p className="flex aspect-[4/3] items-end p-4 text-muted">Este aviso no trae foto</p>
          )}
          <SaveCandidate id={item.id} ids={item.ids} />
        </div>
      </div>
      <div className="col-span-12 min-w-0 lg:col-span-5 lg:col-start-1 lg:row-start-1">
        <Ficha item={item} variant="page" why={why} mark={mark} level={level} />
      </div>
    </article>
  );
}
