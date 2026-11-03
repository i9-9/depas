import { addedPhrase, isNew, siteLabel, streetOf, type Listing } from "@/lib/listings";
import { airLine, decisionCopy, medianLine, netLine, priceLine, seenLine } from "@/lib/verdict";
import { dealFacts, placeFacts, type Fact } from "@/components/Specs";
import { PricePair } from "@/components/PricePair";
import { Verdict } from "@/components/Verdict";
import { VisitPad } from "@/components/VisitPad";

function kickerOf(item: Listing): { text: string; tone?: "signal" | "muted" | "title" }[] {
  const out: { text: string; tone?: "signal" | "muted" | "title" }[] = [];
  if (!item.active) out.push({ text: "Ya no está", tone: "muted" });
  const entered = addedPhrase(item.first_seen);
  if (entered) out.push({ text: entered, tone: isNew(item) ? "signal" : "title" });
  if (item.zone) {
    out.push({ text: item.zone_unverified ? `${item.zone}, sin confirmar` : item.zone });
  }
  if (item.site) out.push({ text: siteLabel(item.site) });
  return out;
}

function Facts({ item, wide }: { item: Listing; wide: boolean }) {
  const rows = [...placeFacts(item), ...dealFacts(item)];
  return (
    <dl className={wide ? "facts" : "facts facts-2"}>
      {rows.map((row) => (
        <FactCell key={row.label} row={row} />
      ))}
    </dl>
  );
}

function FactCell({ row }: { row: Fact }) {
  const missing = row.value === "—";
  const tone = missing ? "text-muted" : row.tone === "signal" ? "text-signal" : "text-title";
  return (
    <div>
      <dt className="kicker text-muted">{row.label}</dt>
      <dd className={`idx mt-1 text-[1.25rem] leading-none ${tone}`}>{row.value}</dd>
      {row.hint ? <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{row.hint}</p> : null}
    </div>
  );
}

function Decision({ item }: { item: Listing }) {
  const copy = decisionCopy(item);
  if (!copy) return null;
  const edge =
    item.decision === "comprar"
      ? "border-signal"
      : item.decision === "negociar"
        ? "border-accent"
        : "border-line";
  const word =
    item.decision === "comprar"
      ? "text-signal"
      : item.decision === "descartar"
        ? "text-muted"
        : "text-title";
  return (
    <div className={`border-l-2 pl-3 ${edge}`}>
      <p className={`text-[1.375rem] leading-none ${word}`}>{copy.label}</p>
      {copy.line ? <p className="mt-2 max-w-prose text-ink">{copy.line}</p> : null}
    </div>
  );
}

export function Ficha({
  item,
  variant,
  why,
  mark,
  level = "h1",
}: {
  item: Listing;
  variant: "page" | "sheet";
  why?: string | null;
  mark?: string | null;
  level?: "h1" | "h2";
}) {
  const street = streetOf(item);
  const title = item.title && item.title !== street ? item.title : null;
  const kick = variant === "page" ? kickerOf(item) : [];
  const gaps = (item.gaps || []).filter(Boolean);
  const notes = [medianLine(item), airLine(item), netLine(item), priceLine(item), seenLine(item)].filter(
    (line): line is string => Boolean(line),
  );
  const links = (
    <>
      <div className={variant === "page" ? "cta-dock" : undefined}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn-solid ${variant === "sheet" ? "w-full sm:w-auto" : ""}`}
        >
          Abrir el aviso en {siteLabel(item.site)}
        </a>
      </div>
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
    </>
  );

  return (
    <div
      className={
        variant === "page" ? "flex min-w-0 flex-col gap-8 max-lg:pb-28" : "flex min-w-0 flex-col gap-5"
      }
    >
      {variant === "page" ? (
        <header>
          {mark ? <p className="kicker text-muted">{mark}</p> : null}
          {kick.length ? (
            <p className="kicker">
              {kick.map((bit, i) => (
                <span key={bit.text}>
                  {i > 0 ? <span className="text-muted"> · </span> : null}
                  <span
                    className={
                      bit.tone === "signal" ? "text-signal" : bit.tone === "title" ? "text-title" : "text-muted"
                    }
                  >
                    {bit.text}
                  </span>
                </span>
              ))}
            </p>
          ) : null}
          {level === "h2" ? (
            <h2 className={`display text-title ${kick.length || mark ? "mt-3" : ""}`}>
              {item.address || item.title || "Sin dirección"}
            </h2>
          ) : (
            <h1 className={`display text-title ${kick.length || mark ? "mt-3" : ""}`}>
              {item.address || item.title || "Sin dirección"}
            </h1>
          )}
          {item.address_unverified ? (
            <p className="mt-3 text-ink">Hay que verificar la dirección.</p>
          ) : null}
          {why ? <p className="measure mt-4 text-ink">{why}</p> : null}
        </header>
      ) : title ? (
        <p className="line-clamp-2 text-ink">{title}</p>
      ) : null}

      <PricePair item={item} large={variant === "page"} />
      <Decision item={item} />
      {gaps.length ? <p className="text-ink">No entra: {gaps.join(", ")}.</p> : null}
      {links}
      <Facts item={item} wide={variant === "page"} />
      <Verdict data={item.verdict} />
      <VisitPad id={item.id} />
      <details>
        <summary className="link flex min-h-11 cursor-pointer items-center text-ink">De dónde sale</summary>
        <div className="measure space-y-2 pt-2 text-muted">
          {notes.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {variant === "page" ? (
            <p>
              Entre los 3 ambientes con cubiertos, gana el que más margen deja contra la salida de
              su barrio. El neto en dólares no elige el barrio. Sin cubiertos no puede ser el
              candidato. Lo que no se arregla con obra no entra.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
