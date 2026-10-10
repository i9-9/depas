import type { Metadata } from "next";
import { Candidate } from "@/components/Candidate";
import { SiteChrome } from "@/components/SiteChrome";
import { isAlert } from "@/lib/listings";
import { loadListings } from "@/lib/load-listings";
import { loadPick } from "@/lib/load-pick";
import { resolvePick } from "@/lib/pick";

export function generateMetadata(): Metadata {
  const pick = resolvePick(loadListings(), loadPick());
  const name = pick.listing?.address || pick.listing?.title || "El de ahora";
  const prefix = pick.listing && isAlert(pick.listing) ? "Salió hace poco · " : "";
  return { title: `${prefix}${name}` };
}

export default function HomePage() {
  const listings = loadListings();
  const pick = resolvePick(listings, loadPick());
  const active = listings.filter((x) => x.active).length;
  return (
    <SiteChrome
      current="candidato"
      archiveCount={active}
      listings={listings}
      pickId={pick.listing?.id ?? null}
    >
      <Candidate pick={pick} />
    </SiteChrome>
  );
}
