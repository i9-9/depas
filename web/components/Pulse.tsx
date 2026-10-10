import {
  formatUsd,
  hotListings,
  isNew,
  lastDrop,
  publishedAgo,
  streetOf,
  type Listing,
} from "@/lib/listings";

export function Pulse({
  listings,
  pickId = null,
  current,
}: {
  listings: Listing[];
  pickId?: string | null;
  current: "candidato" | "archivo";
}) {
  const hot = hotListings(listings);
  if (!hot.length) return null;

  const lead = hot[0];
  const rest = hot.slice(1, 3);
  const published = isNew(lead);
  const ago = publishedAgo(lead.first_seen);
  const isPick = Boolean(
    pickId && (lead.id === pickId || lead.ids.includes(pickId)),
  );
  const href = isPick ? "/" : lead.url;
  const stay = current === "candidato" && isPick;
  const drop = lastDrop(lead);

  if (stay) {
    if (!rest.length) return null;
    return (
      <aside aria-live="polite" className="border-b border-line py-3">
        <p className="text-ink">
          También salió{" "}
          {rest.map((item, i) => (
            <span key={item.id}>
              {i > 0 ? (i === rest.length - 1 ? " y " : ", ") : ""}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                {streetOf(item).trim()}
              </a>
            </span>
          ))}.
        </p>
      </aside>
    );
  }

  const headline = published
    ? ago
      ? `Salió ${ago}`
      : "Salió recién"
    : drop
      ? `Bajó el precio un ${drop.pct}%`
      : "Bajó el precio";

  const line = (
    <p>
      <span className="text-signal">{headline}</span>
      <span className="text-title">
        {" · "}
        {streetOf(lead)}
        {lead.price != null ? ` · ${formatUsd(lead.price)}` : ""}
      </span>
      {rest.length === 1 ? (
        <span className="text-muted"> · también {streetOf(rest[0])}</span>
      ) : rest.length > 1 ? (
        <span className="text-muted">
          {" "}
          · también {streetOf(rest[0])} y {streetOf(rest[1])}
        </span>
      ) : null}
    </p>
  );

  return (
    <aside aria-live="polite" aria-atomic="true" className="border-b border-line py-3">
      {href ? (
        <a
          href={href}
          target={href.startsWith("/") ? undefined : "_blank"}
          rel={href.startsWith("/") ? undefined : "noopener noreferrer"}
          className="hit block"
        >
          {line}
        </a>
      ) : (
        line
      )}
    </aside>
  );
}
