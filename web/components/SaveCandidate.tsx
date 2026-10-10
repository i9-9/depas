"use client";

import { useEffect, useState } from "react";
import { FavoriteButton } from "@/components/FavoriteMark";
import { readPrefs, writePrefs } from "@/lib/storage";

export function SaveCandidate({ id, ids }: { id: string; ids?: string[] }) {
  const all = ids?.length ? ids : [id];
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const prefs = readPrefs();
    setSaved(all.some((x) => prefs.saved.includes(x)));
    setReady(true);
  }, [all.join("|")]);

  function toggle() {
    const prefs = readPrefs();
    const on = all.some((x) => prefs.saved.includes(x));
    const next = on ? prefs.saved.filter((x) => !all.includes(x)) : [...prefs.saved, ...all];
    writePrefs({
      saved: next,
      discarded: prefs.discarded.filter((x) => !all.includes(x)),
    });
    setSaved(!on);
    setNote(on ? "Sacado de guardados." : "Guardado para después.");
  }

  return (
    <div className="absolute right-2 top-2 z-[1] bg-card md:right-3 md:top-3">
      <FavoriteButton on={saved} onClick={toggle} disabled={!ready} size="md" />
      <p aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}
