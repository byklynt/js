/**
 * Marketing switches. `showSocialProof` shows/hides ALL social proof sections on the landing page
 * (headline, testimonials, rating, comparison table, sales card) with one change. The content itself
 * lives in lib/landing-content.ts and should be replaced with real data before launch.
 */
export const siteConfig: {
  showSocialProof: boolean;
  /** Public support contacts, shown on the legal pages. Leave a field empty ("") until the real channel exists: an empty field renders nothing. */
  supportEmail: string;
  /** International format, digits only, e.g. "6281234567890". */
  whatsapp: string;
  /** Username without the "@", e.g. "jagoansosmed". */
  telegram: string;
} = {
  showSocialProof: true,
  supportEmail: "",
  whatsapp: "",
  telegram: "",
};
