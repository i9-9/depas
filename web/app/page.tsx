import { Catalog } from "@/components/Catalog";
import { lastNovelty, loadListings } from "@/lib/listings";

export default function HomePage() {
  const listings = loadListings();
  return <Catalog listings={listings} lastNovelty={lastNovelty(listings)} />;
}
