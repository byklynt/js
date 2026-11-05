import "server-only";
import { cache } from "react";
import { defaultSettings, type SiteSettings } from "@/lib/admin-data";
import { RULE_KEYS, RULE_LABELS, type OrderRuleSet, type RuleKey } from "@/lib/order-rules";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Stored values win; keys that were added to the defaults later still get their default. Arrays are replaced, not merged. */
function merge<T>(base: T, stored: unknown): T {
  if (!isPlain(base) || !isPlain(stored)) return (stored === undefined ? base : (stored as T));
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(stored)) out[k] = k in base ? merge((base as Plain)[k], v) : v;
  return out as T;
}

/**
 * The site settings: defaults (lib/admin-data) overlaid with the single site_settings row, and the platform rules from
 * service_rules. Per-request cache. Server only: the row can hold webhook URLs.
 */
export const loadSettings = cache(async (): Promise<SiteSettings> => {
  const db = supabaseAdmin();
  const [{ data: row }, { data: rules }] = await Promise.all([db.from("site_settings").select("data").maybeSingle(), db.from("service_rules").select("*")]);
  const settings = merge(defaultSettings(), row?.data ?? {});
  for (const r of rules ?? []) {
    const key = r.platform as RuleKey;
    if (!(RULE_KEYS as string[]).includes(key)) continue;
    settings.orderRules[key] = { key, label: r.label || RULE_LABELS[key], title: r.title, bullets: r.bullets, version: r.version, updatedAt: r.updated_at } satisfies OrderRuleSet;
  }
  return settings;
});

/** Stores the settings (everything except the rules, which live in service_rules). */
export async function saveSettings(settings: SiteSettings, adminId?: string): Promise<void> {
  const { orderRules: _rules, ...data } = settings;
  void _rules;
  const { error } = await supabaseAdmin().from("site_settings").upsert({ id: true, data: data as never, updated_by: adminId ?? null });
  if (error) throw new Error(`site_settings: ${error.message}`);
}

/** Saves one platform's rules; the caller bumps `version` (nextRuleVersion). */
export async function saveRuleSet(set: OrderRuleSet): Promise<void> {
  const { error } = await supabaseAdmin().from("service_rules").upsert({
    platform: set.key, label: set.label, title: set.title, bullets: set.bullets, version: set.version, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`service_rules: ${error.message}`);
}
