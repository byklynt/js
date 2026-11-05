"use client";

import { useEffect, useState } from "react";
import { getOrderRulesAction } from "@/lib/user-actions";
import { DEFAULT_CANCEL_POLICY, defaultOrderRules, type CancelPolicy, type OrderRuleSet, type RuleKey } from "@/lib/order-rules";

type Loaded = { rules: Record<RuleKey, OrderRuleSet>; policy: CancelPolicy; loaded: boolean };

const fallback: Loaded = { rules: defaultOrderRules(), policy: DEFAULT_CANCEL_POLICY, loaded: false };
let cache: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  inflight ??= getOrderRulesAction().then((r) => (cache = { rules: r.rules, policy: r.policy, loaded: true }));
  return inflight;
}

/**
 * The rules users must accept and the cancel policy, from the server settings (the ones the admin edits).
 * Until they arrive the defaults are shown and `loaded` is false: the checkbox stays disabled so nobody can accept a
 * version they have not actually seen. The server re-checks the version on every order anyway.
 */
export function useOrderRules(): Loaded {
  const [state, setState] = useState<Loaded>(cache ?? fallback);
  useEffect(() => {
    let alive = true;
    // Always re-read once per mount so an admin edit shows up on the next visit.
    inflight = null;
    void load().then((r) => alive && setState(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
