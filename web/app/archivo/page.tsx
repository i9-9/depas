import type { Metadata } from "next";
import { Catalog } from "@/components/Catalog";
import { SiteChrome } from "@/components/SiteChrome";
import { lastNovelty, loadListings } from "@/lib/load-listings";
import { loadPick } from "@/lib/load-pick";
import { resolvePick } from "@/lib/pick";

export const metadata: Metadata = {
  title: "Lista · Recoleta y alrededores",
};

export default function ArchivoPage() {
  const listings = loadListings();
  const pick = resolvePick(listings, loadPick());
  return (
    <SiteChrome current="archivo">
      <Catalog
        listings={listings}
        lastNovelty={lastNovelty(listings)}
        pickId={pick.listing?.id ?? null}
      />
    </SiteChrome>
  );
}
