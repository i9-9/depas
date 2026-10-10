"use client";

import { useEffect, useState } from "react";
import { FavoriteButton } from "@/components/FavoriteMark";
import { readPrefs, toggleId, writePrefs } from "@/lib/storage";

export function SaveCandidate({ id }: { id: string }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setSaved(readPrefs().saved.includes(id));
    setReady(true);
  }, [id]);

  function toggle() {
    const prefs = readPrefs();
    const next = toggleId(prefs.saved, id);
    writePrefs({
      saved: next,
      discarded: prefs.discarded.filter((x) => x !== id),
    });
    const on = next.includes(id);
    setSaved(on);
    setNote(on ? "Guardado en favoritos." : "Sacado de favoritos.");
  }

  return (
    <div className="absolute right-3 top-3 z-[1] bg-bg">
      <FavoriteButton on={saved} onClick={toggle} disabled={!ready} size="lg" />
      <p aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}
