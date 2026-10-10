import { dropLine, formatNum, lastDrop, type Listing } from "@/lib/listings";

function amount(n: number | null): string {
  return formatNum(n);
}

export function PricePair({
  item,
  large = false,
  inline = false,
}: {
  item: Listing;
  large?: boolean;
  inline?: boolean;
}) {
  const drop = lastDrop(item);
  const detail = dropLine(item);
  if (inline) {
    return <span className="idx text-title">{amount(item.price)}</span>;
  }
  return (
    <div>
      <p className="kicker text-muted">USD</p>
      <p className={`idx mt-1 font-normal text-title ${large ? "display-xl" : "display"}`}>
        {amount(item.price)}
      </p>
      {drop && detail && (
        <p className="mt-3 max-w-prose text-signal">
          <span className="idx line-through text-muted">{amount(drop.from)}</span>
          {" · "}
          {detail}
        </p>
      )}
    </div>
  );
}
