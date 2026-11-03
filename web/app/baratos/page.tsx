import type { Metadata } from "next";
import { Baratos } from "@/components/Baratos";
import { SiteChrome } from "@/components/SiteChrome";
import { loadBaratos } from "@/lib/load-baratos";

export function generateMetadata(): Metadata {
  const n = loadBaratos().length;
  return { title: n ? `${n} más baratos · Colegiales` : "Más baratos · Colegiales" };
}

export default function BaratosPage() {
  const rows = loadBaratos();
  return (
    <SiteChrome current="baratos" archiveCount={rows.length} kicker="Colegiales" listings={[]}>
      <Baratos rows={rows} />
    </SiteChrome>
  );
}
