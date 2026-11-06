import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Ticket attachments (3 files, 5 MB each) travel in server-action FormData.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  partialPrefetching: true,
  // The first legal pages lived at English paths; keep old links (emails, bookmarks) working.
  async redirects() {
    return [
      // The public status page was removed: old links go to the home page (permanent).
      { source: "/status", destination: "/", permanent: true },
      { source: "/terms", destination: "/syarat-ketentuan", permanent: true },
      { source: "/refund-policy", destination: "/kebijakan-refund", permanent: true },
    ];
  },
  // The logo file is supplied by the owner (public/brand/logo-mark.png). When it is absent the Logo component shows its "JS"
  // stand-in right away instead of requesting an image that would 404 on every page.
  env: { NEXT_PUBLIC_HAS_LOGO: existsSync(join(process.cwd(), "public", "brand", "logo-mark.png")) ? "1" : "0" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
