import {
  exitMargin,
  fold,
  hasCoveredArea,
  isThesis,
  rankByExit,
  type Listing,
  type PickFile,
} from "@/lib/listings";

export type ResolvedPick = {
  listing: Listing | null;
  thesis: Listing | null;
  closes: boolean;
  rank: number;
  total: number;
  manual: boolean;
  note: string;
  why: string;
  thesisWhy: string;
  aside: string;
};

function sameListing(a: Listing, b: Listing): boolean {
  return a.id === b.id || a.ids.includes(b.id) || b.ids.includes(a.id);
}

function bestByZone(pool: Listing[]): Listing | null {
  const by = new Map<string, Listing[]>();
  for (const item of pool) {
    const zone = item.zone || "";
    const rows = by.get(zone) || [];
    rows.push(item);
    by.set(zone, rows);
  }
  const winners = [...by.values()].map((rows) => rows.slice().sort(rankByExit)[0]);
  winners.sort(rankByExit);
  return winners[0] || null;
}

function usdM2(n: number): string {
  return `USD ${n.toLocaleString("es-AR")}/m²`;
}

function whyNumber(item: Listing, pool: Listing[], closes: boolean): string {
  const n = pool.length;
  const zones = new Set(pool.map((x) => x.zone).filter(Boolean));
  const zone = item.zone || "su barrio";
  const exitBit = item.exit_usd_m2 != null ? ` (${usdM2(item.exit_usd_m2)})` : "";
  if (!closes) {
    return `Ninguno de los ${n} con cubiertos llega a la salida de su barrio. Este, en ${zone}, es el que menos se pasa.`;
  }
  if (zones.size > 1) {
    return `De los ${n} de 3 ambientes con cubiertos, este es el mejor de ${zone} y queda arriba de los otros barrios. El margen se mide contra la salida de cada uno${exitBit}, no en dólares.`;
  }
  return `De los ${n} de 3 ambientes con cubiertos, este es el que más margen deja contra la salida de ${zone}${exitBit}.`;
}

function whyThesis(item: Listing): string {
  const tags = item.tags || [];
  const bits: string[] = [];
  if (tags.some((t) => fold(t).includes("epoca"))) bits.push("de época");
  if (tags.includes("para reciclar")) bits.push("para reciclar");
  if (tags.includes("edificio ok")) bits.push("el edificio se aguanta");
  const what = bits.join(", ");
  const lead = what ? `${what.charAt(0).toUpperCase()}${what.slice(1)}` : "La tesis";
  const margin = exitMargin(item);
  const short = margin != null && margin <= 0 ? ` Contra la salida de ${item.zone || "su barrio"} no cierra.` : "";
  return `${lead}, con cubiertos. No es el que mejor da el número.${short}`;
}

function asideFor(listings: Listing[]): string {
  const zones = [
    ...new Set(
      listings
        .filter(
          (x) =>
            x.active &&
            x.price != null &&
            x.ambientes === 3 &&
            hasCoveredArea(x) &&
            exitMargin(x) == null &&
            x.zone,
        )
        .map((x) => x.zone as string),
    ),
  ];
  if (!zones.length) return "";
  const who = zones.length === 1 ? zones[0] : zones.slice(0, -1).join(", ") + " y " + zones[zones.length - 1];
  return `${who} no entra a la cuenta: no hay metro de salida.`;
}

export function resolvePick(listings: Listing[], pick: PickFile | null): ResolvedPick {
  const active = listings.filter((x) => x.active && x.price != null);
  const trios = active.filter((x) => x.ambientes === 3);
  const covered = trios.filter(hasCoveredArea);
  const race = covered.filter((x) => exitMargin(x) != null);
  const note = pick?.note || "";
  const aside = asideFor(listings);
  const empty = (why: string): ResolvedPick => ({
    listing: null,
    thesis: null,
    closes: false,
    rank: 0,
    total: race.length,
    manual: false,
    note,
    why,
    thesisWhy: "",
    aside,
  });

  const pinned = pick?.manual ? pick.id : null;
  if (pinned) {
    const listing = listings.find((x) => x.id === pinned || x.ids.includes(pinned)) || null;
    if (listing) {
      return {
        listing,
        thesis: null,
        closes: (exitMargin(listing) ?? 0) > 0,
        rank: 1,
        total: race.length,
        manual: true,
        note,
        why: note || "Lo elegiste a mano.",
        thesisWhy: "",
        aside: "",
      };
    }
  }

  if (!covered.length) {
    return empty(
      trios.length
        ? "Ningún 3 ambientes tiene los cubiertos. Los que hay traen un total, y con eso no elijo."
        : "Todavía no hay un 3 ambientes.",
    );
  }
  if (!race.length) {
    const where = aside.replace(" no entra a la cuenta: no hay metro de salida.", "");
    return {
      ...empty(
        where
          ? `Hay 3 ambientes con cubiertos en ${where}, pero no hay metro de salida. Sin eso no hay con qué comparar.`
          : "Hay 3 ambientes con cubiertos, pero ninguno tiene metro de salida. Sin eso no hay con qué comparar.",
      ),
      aside: "",
    };
  }

  const listing = bestByZone(race);
  if (!listing) return empty("Todavía no hay un 3 ambientes con cubiertos.");
  const closes = (exitMargin(listing) ?? 0) > 0;
  const thesisBest = bestByZone(race.filter(isThesis));
  const thesis = thesisBest && !sameListing(thesisBest, listing) ? thesisBest : null;
  return {
    listing,
    thesis,
    closes,
    rank: 1,
    total: race.length,
    manual: false,
    note,
    why: whyNumber(listing, race, closes),
    thesisWhy: thesis ? whyThesis(thesis) : "",
    aside,
  };
}
