import type { Verdict as VerdictData } from "@/lib/listings";
import { joinEs } from "@/lib/verdict";

function Block({
  title,
  items,
  tone = "ink",
}: {
  title: string;
  items: string[];
  tone?: "title" | "ink";
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className={tone === "title" ? "text-title" : "text-muted"}>{title}</p>
      <ul className="mt-2 space-y-1 text-ink">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function Verdict({
  data,
  compact = false,
}: {
  data: VerdictData;
  compact?: boolean;
}) {
  if (compact) {
    const bits = [
      data.entra.length ? joinEs(data.entra) : "",
      data.resta.length ? joinEs(data.resta) : "",
    ].filter(Boolean);
    if (!bits.length) return null;
    return <p className="text-[13px]">{bits.join(". ")}.</p>;
  }
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <Block title="A favor" items={data.entra} tone="title" />
      <Block title="En contra" items={data.resta} />
      <Block title="No dice" items={data.falta} />
    </div>
  );
}
