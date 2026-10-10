import { rankByScore, type Listing, type PickFile } from "@/lib/listings";

export type ResolvedPick = {
  listing: Listing | null;
  rank: number;
  total: number;
  manual: boolean;
  note: string;
};

export function resolvePick(listings: Listing[], pick: PickFile | null): ResolvedPick {
  const active = listings
    .filter((x) => x.active && x.price != null)
    .slice()
    .sort(rankByScore);
  const total = listings.filter((x) => x.active).length;
  const note = pick?.note || "";
  if (pick?.manual && pick.id) {
    const listing = listings.find((x) => x.id === pick.id) || null;
    if (listing) {
      const idx = active.findIndex((x) => x.id === listing.id);
      return { listing, rank: idx >= 0 ? idx + 1 : 0, total, manual: true, note };
    }
  }
  const listing = active[0] || null;
  return { listing, rank: listing ? 1 : 0, total, manual: false, note };
}
