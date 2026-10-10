export type Prefs = {
  saved: string[];
  discarded: string[];
};

const KEY = "depas-prefs-v1";

function empty(): Prefs {
  return { saved: [], discarded: [] };
}

export function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      saved: Array.isArray(parsed.saved) ? parsed.saved.map(String) : [],
      discarded: Array.isArray(parsed.discarded) ? parsed.discarded.map(String) : [],
    };
  } catch {
    return empty();
  }
}

export function writePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota: la app sigue */
  }
}

export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
