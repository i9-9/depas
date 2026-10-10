import type { Metadata } from "next";
import { Catalog } from "@/components/Catalog";
import { SiteChrome } from "@/components/SiteChrome";
import { hotListings } from "@/lib/listings";
import { lastNovelty, loadListings } from "@/lib/load-listings";
import { loadPick } from "@/lib/load-pick";
import { resolvePick } from "@/lib/pick";

export function generateMetadata(): Metadata {
  const n = hotListings(loadListings()).length;
  return {
    title: n
      ? `${n === 1 ? "Vimos uno nuevo" : `Vimos ${n} nuevos`} · todos`
      : "Todos los departamentos",
  };
}

export default function ArchivoPage() {
  const listings = loadListings();
  const pick = resolvePick(listings, loadPick());
  return (
    <SiteChrome
      current="archivo"
      listings={listings}
      pickId={pick.listing?.id ?? null}
    >
      <Catalog
        listings={listings}
        lastNovelty={lastNovelty(listings)}
        pickId={pick.listing?.id ?? null}
      />
    </SiteChrome>
  );
}
