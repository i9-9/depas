import data from "../data/listings-baratos.json";

export type Barato = {
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
};

type FileShape = {
  last_change: string | null;
  listings: Barato[];
};

export function loadBaratos(): Barato[] {
  return ((data as FileShape).listings || []).filter((row) => row.active !== false);
}
