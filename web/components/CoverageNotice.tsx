import { publishedAgo, siteLabel } from "@/lib/listings";
import { joinEs } from "@/lib/verdict";
import { loadArgenpropRun, sourceGaps } from "@/lib/load-listings";

function errorLabel(raw: string): string {
  const rest = raw.replace(/^argenprop\s*·\s*/i, "");
  return rest.split(":")[0].trim() || rest;
}

function macSummary(run: NonNullable<ReturnType<typeof loadArgenpropRun>>): string {
  const ago = publishedAgo(run.ran_at) || "hace rato";
  const n = run.matched;
  const pass =
    n === 0 ? "ninguno pasa el filtro" : n === 1 ? "1 pasa el filtro" : `${n} pasan el filtro`;
  const bits = [`Corrida de ${ago}`, pass];
  if (run.errors.length) {
    bits.push(`WAF en ${joinEs(run.errors.map(errorLabel))}`);
  }
  if (run.new) {
    bits.push(run.new === 1 ? "1 nuevo" : `${run.new} nuevos`);
  }
  return `${bits.join(". ")}.`;
}

export function CoverageNotice() {
  const gaps = sourceGaps();
  const run = loadArgenpropRun();
  if (!gaps.length && !run) return null;
  return (
    <div className="mt-5 border border-line px-3 py-3 text-[0.9375rem] text-ink">
      {run ? (
        <div>
          <p className="text-title">Mac · Argenprop</p>
          <p className="mt-2">{macSummary(run)}</p>
          {run.lines.length ? (
            <ul className="mt-2 space-y-1 text-muted">
              {run.lines.map((line) => (
                <li key={line}>{line.replace(/^\[(?:ok|error|argenprop)\]\s/, "")}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {gaps.length ? (
        <div className={run ? "mt-3 border-t border-line pt-3" : undefined}>
          <p className="text-title">Falta cobertura</p>
          <ul className="mt-2 space-y-1">
            {gaps.map((g) => (
              <li key={g.site}>
                {g.reason === "empty"
                  ? g.site === "argenprop"
                    ? `${siteLabel(g.site)} no tiene avisos. Si corre en la Mac y sigue vacío, el scrape no está dejando nada.`
                    : `${siteLabel(g.site)} no tiene avisos.`
                  : `${siteLabel(g.site)} no se actualiza desde ${g.last_change || "hace rato"}.`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
