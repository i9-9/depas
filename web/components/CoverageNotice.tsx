import { siteLabel } from "@/lib/listings";
import { sourceGaps } from "@/lib/load-listings";

export function CoverageNotice() {
  const gaps = sourceGaps();
  if (!gaps.length) return null;
  return (
    <div className="mt-5 border border-line px-3 py-3 text-[0.9375rem] text-ink">
      <p className="text-title">Falta cobertura</p>
      <ul className="mt-2 space-y-1">
        {gaps.map((g) => (
          <li key={g.site}>
            {g.reason === "empty"
              ? `${siteLabel(g.site)} no tiene avisos. Si corre en la Mac y sigue vacío, el scrape no está dejando nada.`
              : `${siteLabel(g.site)} no se actualiza desde ${g.last_change || "hace rato"}.`}
          </li>
        ))}
      </ul>
    </div>
  );
}
