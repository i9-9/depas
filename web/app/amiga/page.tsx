import type { Metadata } from "next";
import { Amiga } from "@/components/Amiga";
import { SiteChrome } from "@/components/SiteChrome";
import { loadAmiga } from "@/lib/load-amiga";

export function generateMetadata(): Metadata {
  const n = loadAmiga().length;
  return { title: n ? `${n} para Mailén` : "Para Mailén" };
}

export default function AmigaPage() {
  const rows = loadAmiga();
  return (
    <SiteChrome current="amiga" archiveCount={rows.length} kicker="Para Mailén" listings={[]}>
      <Amiga rows={rows} />
    </SiteChrome>
  );
}
