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
    return <span className="idx">{amount(item.price)}</span>;
  }
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em]">USD</p>
      <p className={`idx display mt-1 font-normal text-ink ${large ? "text-[56px] sm:text-[72px]" : "text-[40px]"}`}>
        {amount(item.price)}
      </p>
      {drop && detail && (
        <p className="mt-2 text-[13px] text-accent">
          <span className="idx line-through text-ink/50">{amount(drop.from)}</span>
          {" · "}
          {detail}
        </p>
      )}
    </div>
  );
}
