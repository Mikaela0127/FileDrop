"use client";
import { useEffect } from "react";
import { reportClientFailure } from "../lib/operations/client-diagnostics";
import { useLanguage } from "../lib/i18n/language-provider";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useLanguage();
  useEffect(() => {
    reportClientFailure("render");
  }, []);
  return (
    <main className="mx-auto max-w-xl p-8" role="alert">
      <h1 className="text-2xl font-semibold">{t("error.title")}</h1>
      <p className="mt-4">{t("error.description")}</p>
      <button
        className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-white"
        onClick={retry}
      >
        {t("common.tryAgain")}
      </button>
    </main>
  );
}
