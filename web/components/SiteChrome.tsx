export function SiteChrome({
  current,
  archiveCount,
  children,
}: {
  current: "candidato" | "archivo";
  archiveCount?: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#contenido" className="skip">
        Ir al contenido
      </a>
      <div className="h-1.5 bg-accent" />
      <div className="page pb-24 pt-5">
        <header className="border-b border-ink pb-3">
          <div className="g items-end">
            <p className="col-span-12 text-[11px] leading-none tracking-[0.18em] uppercase sm:col-span-8">
              Recoleta y alrededores
            </p>
            {archiveCount != null ? (
              <p className="col-span-12 text-right idx text-[11px] leading-none text-quiet sm:col-span-4">
                {archiveCount} {archiveCount === 1 ? "aviso" : "avisos"}
              </p>
            ) : null}
          </div>
          <nav aria-label="Secciones" className="g mt-4">
            <NavLink href="/" active={current === "candidato"}>
              Candidato
            </NavLink>
            <NavLink href="/archivo/" active={current === "archivo"}>
              Lista
            </NavLink>
          </nav>
        </header>
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
  const cls = "col-span-6 flex min-h-11 items-end border-b-2 pb-1 text-[22px] leading-none";
  if (active) {
    return (
      <span aria-current="page" className={`${cls} border-accent text-ink`}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} className={`${cls} border-transparent text-quiet hover:text-ink`}>
      {children}
    </a>
  );
}
