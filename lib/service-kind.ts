/** Kind of a provider service type. Mirrors public.service_kind in the database. */
export type ServiceKind = "default" | "comments" | "unsupported";

export function serviceKind(providerType: string | null | undefined): ServiceKind {
  const t = (providerType ?? "").trim().toLowerCase();
  if (t === "" || t === "default") return "default";
  if (t === "custom comments") return "comments";
  return "unsupported";
}
