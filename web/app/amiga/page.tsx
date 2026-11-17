import type { Metadata } from "next";
import { Amiga } from "@/components/Amiga";
import { SiteChrome } from "@/components/SiteChrome";
import { loadAmiga } from "@/lib/load-amiga";

export function generateMetadata(): Metadata {
  const n = loadAmiga().length;
  return { title: n ? `${n} para una amiga` : "Para una amiga" };
}

export default function AmigaPage() {
  const rows = loadAmiga();
  return (
    <SiteChrome current="amiga" archiveCount={rows.length} kicker="Para una amiga" listings={[]}>
      <Amiga rows={rows} />
    </SiteChrome>
  );
}
