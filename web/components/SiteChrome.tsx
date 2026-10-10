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
      <div className="page pb-24 pt-5">
        <header className="border-b border-line pb-3">
          <div className="g items-end">
            <p className="col-span-12 text-[0.6875rem] leading-none tracking-[0.18em] uppercase text-ink sm:col-span-8">
              Recoleta y alrededores
            </p>
            {archiveCount != null ? (
              <p className="col-span-12 text-right idx text-[0.6875rem] leading-none text-ink sm:col-span-4">
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
