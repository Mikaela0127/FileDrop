"use client";
import { useEffect } from "react";
import { reportClientFailure } from "../lib/operations/client-diagnostics";
import { LanguageProvider, useLanguage } from "../lib/i18n/language-provider";
import { LanguageSwitcher } from "./language-switcher";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientFailure("render");
  }, []);
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <LanguageSwitcher />
          <GlobalErrorContent retry={retry} />
        </LanguageProvider>
      </body>
    </html>
  );
}

function GlobalErrorContent({ retry }: { retry: () => void }) {
  const { t } = useLanguage();
  return (
    <main role="alert">
      <h1>{t("error.globalTitle")}</h1>
      <p>{t("error.globalDescription")}</p>
      <button onClick={retry}>{t("common.tryAgain")}</button>
    </main>
  );
}
