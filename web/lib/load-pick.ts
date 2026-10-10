import raw from "../data/pick.json";
import type { PickFile } from "@/lib/listings";

export function loadPick(): PickFile {
  const data = raw as Partial<PickFile>;
  return {
    id: data.id ?? null,
    manual: Boolean(data.manual),
    note: data.note || "",
  };
}
