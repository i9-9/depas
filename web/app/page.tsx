import type { Metadata } from "next";
import { Candidate } from "@/components/Candidate";
import { SiteChrome } from "@/components/SiteChrome";
import { lastNovelty, loadListings } from "@/lib/load-listings";
import { loadPick } from "@/lib/load-pick";
import { resolvePick } from "@/lib/pick";

export function generateMetadata(): Metadata {
  const pick = resolvePick(loadListings(), loadPick());
  const name = pick.listing?.address || pick.listing?.title || "Candidato";
  return { title: `${name} · candidato` };
}

export default function HomePage() {
  const listings = loadListings();
  const pick = resolvePick(listings, loadPick());
  const active = listings.filter((x) => x.active).length;
  const novelty = lastNovelty(listings);
  return (
    <SiteChrome current="candidato" archiveCount={active}>
      <Candidate pick={pick} />
      {novelty ? (
        <p className="sr-only">Última novedad {novelty}</p>
      ) : null}
    </SiteChrome>
  );
}
