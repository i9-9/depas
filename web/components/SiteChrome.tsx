import { CoverageNotice } from "@/components/CoverageNotice";
import { Pulse } from "@/components/Pulse";
import type { Listing } from "@/lib/listings";

export function SiteChrome({
  current,
  archiveCount,
  listings = [],
  pickId = null,
  kicker = "Recoleta y alrededores",
  children,
}: {
  current: "candidato" | "archivo" | "baratos";
  archiveCount?: number;
  listings?: Listing[];
  pickId?: string | null;
  kicker?: string;
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
            <p className="kicker text-muted">{kicker}</p>
            {archiveCount != null ? (
              <p className="idx kicker shrink-0 text-muted">
                {archiveCount} {archiveCount === 1 ? "departamento" : "departamentos"}
              </p>
            ) : null}
          </div>
          <nav aria-label="Secciones" className="mt-5 flex flex-wrap gap-x-6 gap-y-1 md:grid md:grid-cols-12 md:gap-x-4">
            <NavLink href="/" active={current === "candidato"}>
              El de ahora
            </NavLink>
            <NavLink href="/archivo/" active={current === "archivo"}>
              Todos
            </NavLink>
            <NavLink href="/baratos/" active={current === "baratos"}>
              Más baratos
            </NavLink>
          </nav>
          <p className="measure mt-3 text-[0.8125rem] leading-snug text-muted">
            {current === "candidato"
              ? "El que más encaja hoy. Guardalo con la estrella o abrí el aviso."
              : "Buscá, filtrá y abrí uno para ver por qué entra. La estrella guarda; la cruz saca."}
          </p>
        </header>
        <Pulse listings={listings} pickId={pickId} current={current} />
        <div id="contenido">{children}</div>
        <CoverageNotice />
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
    "flex min-h-11 items-end border-b-2 pb-1 text-[1.0625rem] leading-none tracking-[-0.02em] md:col-span-4";
  if (active) {
    return (
      <span aria-current="page" className={`${cls} border-accent font-bold text-title`}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} className={`${cls} border-transparent font-normal text-muted hover:text-title`}>
      {children}
    </a>
  );
}
