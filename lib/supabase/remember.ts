/**
 * "Ingat saya". The Supabase session cookies are PERSISTENT (30 days) only when the user ticked the box at login; otherwise they are
 * session cookies (gone when the browser closes). A small marker cookie remembers the choice so that every later token refresh (server
 * client, proxy) writes the cookies with the same lifetime.
 */
export const REMEMBER_COOKIE = "jago_remember";
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

/** Cookie options for the Supabase auth cookies: 30 days when remembered, a session cookie otherwise. */
export const authCookieOptions = (remember: boolean) => ({ maxAge: remember ? REMEMBER_MAX_AGE : undefined });

/**
 * The library fills in its own 400-day lifetime, so "no maxAge" is not enough: when the user did NOT choose to be remembered, the
 * lifetime fields are removed from every cookie that is written (a deletion, maxAge 0, is kept as is).
 */
export function lifetimeFor<T extends { maxAge?: number; expires?: Date | number | string }>(options: T | undefined, remember: boolean): T | undefined {
  if (remember || !options || options.maxAge === 0) return options;
  const { maxAge: _m, expires: _e, ...rest } = options;
  void _m;
  void _e;
  return rest as T;
}
