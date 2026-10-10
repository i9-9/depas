import { isNew, publishedAgo, siteLabel, streetOf } from "@/lib/listings";
import { airLine, medianLine, seenLine } from "@/lib/verdict";
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
            Cuando aparezca uno en Recoleta o cerca, con los metros y el
            balcón, lo vas a ver acá.
          </p>
        </div>
      </section>
    );
  }

  const median = medianLine(item);
  const seen = seenLine(item);
  const air = airLine(item);
  const street = streetOf(item);
  const published = isNew(item) ? publishedAgo(item.first_seen) : null;
  const why =
    pick.manual && pick.note
      ? pick.note
      : `De los ${pick.total} que hay, este es el que más encaja.`;

  const photo = (
    <div className="card relative">
      {item.photo ? (
        <Photo
          src={item.photo}
          alt={street}
          priority
          className="aspect-[4/3] w-full"
        />
      ) : (
        <p className="flex aspect-[4/3] items-end p-4 text-muted">
          Este aviso no trae foto
        </p>
      )}
      <SaveCandidate id={item.id} ids={item.ids} />
    </div>
  );

  return (
    <article className="g mt-8 items-start">
      <header className="col-span-12 lg:col-span-5">
        {published ? <p className="kicker text-signal">Lo vimos {published}</p> : null}
        <h1 className={`display text-title ${published ? "mt-3" : ""}`}>
          {item.address || item.title || "Sin dirección"}
        </h1>
        <div className="mt-6">
          <PricePair item={item} large />
        </div>
        <p className="measure mt-4 text-ink">{why}</p>
      </header>

      <div className="col-span-12 lg:col-span-7 lg:row-span-3">{photo}</div>

      <div className="col-span-12 flex min-w-0 flex-col gap-8 lg:col-span-5">
        <div className="cta-dock">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-solid"
          >
            Abrir el aviso en {siteLabel(item.site)}
          </a>
        </div>

        <Specs item={item} />

        <Verdict data={item.verdict} />

        {item.mirrors.length ? (
          <div className="flex flex-col">
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
          </div>
        ) : null}

        <footer className="measure space-y-2 border-t border-line pt-5 text-muted">
          {median && <p>{median}</p>}
          {air && <p>{air}</p>}
          {seen && <p>{seen}</p>}
          <details>
            <summary className="link flex min-h-11 cursor-pointer items-center text-ink">
              ¿Por qué este?
            </summary>
            <p className="mt-2 leading-relaxed text-ink">
              Buscamos un flip: edificio que no haya que tocar, unidad para
              reciclar, cuadra que pague, y aire. El aire es el margen que
              quedaría si lo comprás a este precio, le hacés una obra liviana
              y lo vendés al metro de referencia del barrio. No es un P&L.
              Lo que no se arregla con obra (edificio flojo, metro caro,
              expensas disparadas, sin metros) no entra. Una buena unidad en
              una cuadra floja no es el elegido. El resto está en Todos.
            </p>
          </details>
        </footer>
      </div>
    </article>
  );
}
