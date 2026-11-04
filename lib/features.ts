/**
 * Feature flags for things that need an external service or are not built yet. A `false` flag hides the control (or shows
 * "Belum tersedia") instead of faking it. Flip a flag only when the real thing exists.
 */
export const features = {
  /** Google sign-in: needs an OAuth app. */
  googleLogin: false,
  /** Automatic payments: needs a payment gateway + signed webhook. Until then deposits are manual requests an admin confirms. */
  paymentGateway: false,
  /** Referral program (links, commission, payouts). */
  affiliate: false,
  /** Reseller "panel anak" (child panel). */
  childPanel: false,
  /** Public customer API (/api/v2) and personal API keys. */
  userApi: false,
  /** Two-step verification for regular users (admins have it). */
  userTwoFactor: false,
  /** Sending e-mail (verification, password reset, notifications): needs SMTP. */
  email: false,
  /** Telegram / WhatsApp announcements and the mobile app. */
  messagingChannels: false,
} as const;

export type FeatureKey = keyof typeof features;
