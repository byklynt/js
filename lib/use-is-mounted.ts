import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** false during SSR + hydration, true afterwards. Use for values only known on the client. */
export function useIsMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
