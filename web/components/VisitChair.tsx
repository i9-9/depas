"use client";

import { useEffect, useState } from "react";
import { formatNum, streetOf, type Listing } from "@/lib/listings";
import { readVisits, type Visit } from "@/lib/storage";

const LABEL: Record<Visit["status"], string> = {
  por_ver: "Anotaste",
  visitado: "Lo visitaste",
  en_duda: "En duda",
};

export function VisitChair({
  listings,
  skipIds,
}: {
  listings: Listing[];
  skipIds: string[];
}) {
  const [rows, setRows] = useState<{ item: Listing; visit: Visit }[]>([]);

  useEffect(() => {
    const visits = readVisits();
    const skip = new Set(skipIds);
    const found: { item: Listing; visit: Visit }[] = [];
    for (const item of listings) {
      if (skip.has(item.id) || item.ids.some((id) => skip.has(id))) continue;
      const visit = [item.id, ...item.ids].map((id) => visits[id]).find(Boolean);
      if (!visit) continue;
      const noted = visit.note.trim().length > 0;
      if (visit.status === "por_ver" && !noted) continue;
      found.push({ item, visit });
    }
    setRows(found);
  }, [listings, skipIds]);

  if (!rows.length) return null;
  return (
    <section className="mt-16 border-t border-line pt-10">
      <p className="kicker text-muted">La visita</p>
      <ul className="mt-2">
        {rows.map(({ item, visit }) => (
          <li key={item.id} className="border-b border-line py-4">
            <p className="kicker text-title">{visit.status === "por_ver" ? "Anotaste" : LABEL[visit.status]}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="name mt-2 block text-[1.25rem] text-title"
            >
              {streetOf(item)}
            </a>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {[item.zone, item.price != null ? `USD ${formatNum(item.price)}` : null, item.active ? null : "Ya no está"]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {visit.note.trim() ? <p className="mt-2 max-w-xl text-ink">{visit.note.trim()}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
