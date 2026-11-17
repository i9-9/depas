import data from "../data/listings-amiga.json";

export type Amiga = {
  id: string;
  site: string;
  url: string;
  title: string;
  blurb: string;
  address: string;
  zone: string;
  price: number | null;
  area: number | null;
  area_covered: number | null;
  area_total: number | null;
  ambientes: number | null;
  photo: string;
  tags: string[];
  expensas_ars: number | null;
  expensas_text: string;
  antiguedad_years: number | null;
  piso: number | null;
  first_seen: string | null;
  active: boolean;
  gone_at: string | null;
  /** El mismo depto en otro portal (lo arma la web). */
  mirrors?: { site: string; url: string }[];
};

type FileShape = {
  last_change: string | null;
  listings: Amiga[];
};

export function loadAmiga(): Amiga[] {
  return ((data as FileShape).listings || []).filter((row) => row.active !== false);
}

export function loadAmigaMeta(): { lastChange: string | null } {
  return { lastChange: (data as FileShape).last_change || null };
}
