import { getStore, type UserAuthRecord } from "./store";

/** User credentials + personal settings live in the dev store next to the other persisted state. */
export function loadCreds(): Record<string, UserAuthRecord> {
  return structuredClone(getStore().read().userAuth ?? {});
}

export function saveCreds(creds: Record<string, UserAuthRecord>) {
  getStore().update({ userAuth: creds });
}
