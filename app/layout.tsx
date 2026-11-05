import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { brand, brandColors } from "@/lib/brand";
import { siteConfig } from "@/lib/landing-data";
import { ThemeProvider } from "@/components/theme-provider";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/** Browser chrome color (address bar on mobile): the brand blue. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brandColors.light },
    { media: "(prefers-color-scheme: dark)", color: brandColors.dark },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(brand.domain),
  title: { default: `${brand.name} - ${brand.tagline}`, template: `%s` },
  description: siteConfig.description,
  openGraph: {
    title: `${brand.name} - ${brand.tagline}`, description: siteConfig.description, siteName: brand.name, type: "website", locale: "id_ID",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: brand.name }],
  },
  twitter: { card: "summary_large_image", title: `${brand.name} - ${brand.tagline}`, description: siteConfig.description, images: ["/brand/og-image.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white dark:bg-[#050b16] text-slate-900 dark:text-slate-100 selection:bg-primary-200 selection:text-primary-900">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
