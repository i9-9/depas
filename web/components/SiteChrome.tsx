import { CoverageNotice } from "@/components/CoverageNotice";
import { Pulse } from "@/components/Pulse";
import type { Listing } from "@/lib/listings";

export function SiteChrome({
  current,
  archiveCount,
  listings = [],
  pickId = null,
  children,
}: {
  current: "candidato" | "archivo";
  archiveCount?: number;
  listings?: Listing[];
  pickId?: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#contenido" className="skip">
        Ir al contenido
      </a>
      <div className="page pb-8 pt-4 md:pb-24 md:pt-5">
        <header className="border-b border-line pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="kicker text-muted">Recoleta y alrededores</p>
            {archiveCount != null ? (
              <p className="idx kicker shrink-0 text-muted">
                {archiveCount} {archiveCount === 1 ? "departamento" : "departamentos"}
              </p>
            ) : null}
          </div>
          <nav aria-label="Secciones" className="g mt-5">
            <NavLink href="/" active={current === "candidato"}>
              El de ahora
            </NavLink>
            <NavLink href="/archivo/" active={current === "archivo"}>
              Todos
            </NavLink>
          </nav>
        </header>
        <CoverageNotice />
        <Pulse listings={listings} pickId={pickId} current={current} />
        <div id="contenido">{children}</div>
      </div>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "col-span-6 flex min-h-11 items-end border-b-2 pb-1 text-[clamp(1.25rem,2.4vw,1.375rem)] leading-none";
  if (active) {
    return (
      <span aria-current="page" className={`${cls} border-accent text-title`}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} className={`${cls} border-transparent text-ink hover:text-title`}>
      {children}
    </a>
  );
}
