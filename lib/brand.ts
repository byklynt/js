/** Single source of truth for the product name. Change the brand here, not in individual files. */
export const brand = {
  name: "JagoanSosmed",
  tagline: "SMM Panel untuk Order Sosial Media yang Mudah dan Transparan",
  /** Public site URL (used for metadata, sitemap and links). */
  domain: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Placeholder until a real mailbox exists. */
  supportEmail: "support@jagoansosmed.com",
  /** Prefix for localStorage keys and similar browser storage. */
  storagePrefix: "jagoansosmed",
} as const;

/** Issuer shown in authenticator apps (otpauth URL). */
export const OTP_ISSUER = brand.name;

/**
 * Brand blue for places that cannot read CSS variables (metadata theme-color, manifest, generated icons).
 * Keep in step with --brand in app/globals.css (the one place the blue is defined for the UI).
 */
export const brandColors = {
  light: "#0070FF",
  dark: "#1F7BFF",
  /** Dark page background, used as the manifest background. */
  darkSurface: "#050b16",
} as const;
