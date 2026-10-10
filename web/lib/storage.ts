export type Prefs = {
  saved: string[];
  discarded: string[];
};

export type VisitStatus = "por_ver" | "visitado" | "en_duda";

export type Visit = {
  status: VisitStatus;
  note: string;
  at: string | null;
};

const KEY = "depas-prefs-v1";
const VISITS = "depas-visitas-v1";

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

export function readVisits(): Record<string, Visit> {
  try {
    const raw = window.localStorage.getItem(VISITS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Visit>>;
    const out: Record<string, Visit> = {};
    for (const [id, v] of Object.entries(parsed || {})) {
      if (!v || typeof v !== "object") continue;
      const status = v.status;
      if (status !== "por_ver" && status !== "visitado" && status !== "en_duda") continue;
      out[id] = { status, note: String(v.note || ""), at: v.at || null };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeVisits(visits: Record<string, Visit>): void {
  try {
    window.localStorage.setItem(VISITS, JSON.stringify(visits));
  } catch {
    /* private mode / quota */
  }
}
