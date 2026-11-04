/**
 * TEMPORARY development logging for 2FA problems. Never logs the secret or the code (only whether a code was
 * 6 digits or a backup code, and an 8-char fingerprint of the secret). Silent in production; set SG_DEBUG_2FA=0 to mute.
 * TODO: delete once 2FA is stable.
 */
export const isDev = () => process.env.NODE_ENV !== "production";

export function debug2fa(event: string, data: Record<string, unknown>) {
  if (!isDev() || process.env.SG_DEBUG_2FA === "0") return;
  console.info(`[2fa-debug] ${event} ${JSON.stringify(data)}`);
}
