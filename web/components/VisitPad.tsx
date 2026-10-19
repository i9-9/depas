"use client";

import { useEffect, useState } from "react";
import { readVisits, writeVisits, type Visit, type VisitStatus } from "@/lib/storage";

const STATUSES: { id: VisitStatus; label: string }[] = [
  { id: "por_ver", label: "Por ver" },
  { id: "visitado", label: "Lo visité" },
  { id: "en_duda", label: "En duda" },
];

export function VisitPad({ id }: { id: string }) {
  const [visit, setVisit] = useState<Visit>({ status: "por_ver", note: "", at: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const all = readVisits();
    if (all[id]) setVisit(all[id]);
    setReady(true);
  }, [id]);

  function save(next: Visit) {
    setVisit(next);
    const all = readVisits();
    writeVisits({ ...all, [id]: next });
  }

  if (!ready) return null;
  return (
    <div>
      <p className="text-title">Esta visita</p>
      <p className="mt-1 text-muted">Queda en este dispositivo, no se comparte.</p>
      <div className="seg mt-3" role="group" aria-label="Estado de la visita">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={visit.status === s.id}
            onClick={() => save({ ...visit, status: s.id, at: new Date().toISOString() })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">Nota de la visita</span>
        <textarea
          className="input min-h-24 w-full"
          placeholder="Luz, ruido, distribución, lo que no entra en la card"
          value={visit.note}
          onChange={(e) => save({ ...visit, note: e.target.value, at: new Date().toISOString() })}
        />
      </label>
    </div>
  );
}
