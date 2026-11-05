import type { MetadataRoute } from "next";
import { brand, brandColors } from "@/lib/brand";

/** Web app manifest. Icons are generated from the logo by `npm run brand:assets` (public/brand/icon-*.png). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    start_url: "/",
    display: "standalone",
    background_color: brandColors.darkSurface,
    theme_color: brandColors.light,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
