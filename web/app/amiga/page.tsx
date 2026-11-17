import type { Metadata } from "next";
import { Amiga } from "@/components/Amiga";
import { SiteChrome } from "@/components/SiteChrome";
import { loadAmiga, loadAmigaMeta } from "@/lib/load-amiga";
import { dedupeAmiga } from "@/lib/rank-amiga";

export function generateMetadata(): Metadata {
  const n = dedupeAmiga(loadAmiga()).length;
  return { title: n ? `${n} para Mailén` : "Para Mailén" };
}

export default function AmigaPage() {
  const rows = dedupeAmiga(loadAmiga());
  const { lastChange } = loadAmigaMeta();
  return (
    <SiteChrome current="amiga" archiveCount={rows.length} kicker="Para Mailén" listings={[]}>
      <Amiga rows={rows} lastChange={lastChange} />
    </SiteChrome>
  );
}
