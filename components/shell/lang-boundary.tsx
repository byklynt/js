import { LanguageProvider } from "@/lib/i18n/provider";
import { getLang } from "@/lib/i18n/server";
import { setLanguageAction } from "@/lib/i18n-actions";

/** Server component: reads the cookie and provides the language to the client tree. Wrap it in Suspense. */
export async function LangBoundary({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <LanguageProvider lang={lang} persist={setLanguageAction}>
      {children}
    </LanguageProvider>
  );
}
