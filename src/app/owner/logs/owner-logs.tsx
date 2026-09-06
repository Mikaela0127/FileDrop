"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { LogPage } from "../../../modules/logs/application/log-repository";
import { useLanguage } from "../../../lib/i18n/language-provider";
import type { TranslationKey } from "../../../lib/i18n/translations";

const buttonClass =
  "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50";
export function OwnerLogs() {
  const { locale, t } = useLanguage();
  const [page, setPage] = useState<LogPage>();
  const [level, setLevel] = useState("all");
  const [requestId, setRequestId] = useState("");
  const [applied, setApplied] = useState({ level: "all", requestId: "" });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<TranslationKey>();
  const [messageCount, setMessageCount] = useState(0);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (
      filters: { level: string; requestId: string },
      cursor?: LogPage["next"],
    ) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      const timer = setTimeout(() => current.abort(), 10_000);
      try {
        const query = new URLSearchParams({ level: filters.level });
        if (filters.requestId.trim())
          query.set("requestId", filters.requestId.trim());
        if (cursor) {
          query.set("before", cursor.before);
          query.set("beforeId", cursor.beforeId);
        }
        const response = await fetch(`/api/owner/logs?${query}`, {
          cache: "no-store",
          signal: current.signal,
        });
        if (controller.current !== current) return;
        if (response.status === 401) {
          setUnauthenticated(true);
          setPage(undefined);
          return;
        }
        if (!response.ok)
          throw new Error(
            response.status === 400 ? "INVALID_QUERY" : "UNAVAILABLE",
          );
        const result: LogPage = await response.json();
        if (controller.current !== current) return;
        if (!Array.isArray(result.entries)) throw new Error("UNAVAILABLE");
        setUnauthenticated(false);
        setPage(result);
        setApplied(filters);
        setMessage(result.entries.length ? "logs.showing" : "logs.empty");
        setMessageCount(result.entries.length);
      } catch (error) {
        if (controller.current !== current) return;
        setPage(undefined);
        setMessage(
          error instanceof Error && error.message === "INVALID_QUERY"
            ? "logs.invalid"
            : "logs.unavailable",
        );
      } finally {
        clearTimeout(timer);
        if (controller.current === current) setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    // Schedule the initial request after the effect; Strict Mode cleanup can cancel it.
    let active = true;
    queueMicrotask(() => {
      if (active) void load({ level: "all", requestId: "" });
    });
    return () => {
      active = false;
      controller.current?.abort();
      controller.current = null;
    };
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startLoad({ level, requestId });
  }
  function startLoad(
    filters: { level: string; requestId: string },
    cursor?: LogPage["next"],
  ) {
    setBusy(true);
    setMessage(undefined);
    void load(filters, cursor);
  }
  function download() {
    if (!page) return;
    const url = URL.createObjectURL(
      new Blob(
        [page.entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"],
        { type: "application/x-ndjson" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "filedrop-owner-logs.log";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (unauthenticated)
    return (
      <section className="mt-8 rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold">{t("common.ownerRequired")}</h2>
        <Link className="mt-3 inline-block text-indigo-700" href="/login">
          {t("common.ownerSignIn")}
        </Link>
      </section>
    );

  return (
    <section
      className="mt-8 space-y-5"
      aria-label={t("logs.section")}
      aria-busy={busy}
    >
      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-2xl bg-white p-5 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="text-sm text-slate-700">
          {t("logs.severity")}
          <select
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            disabled={busy}
          >
            <option value="all">{t("logs.all")}</option>
            <option value="error">{t("logs.errors")}</option>
            <option value="info">{t("logs.information")}</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 text-sm text-slate-700">
          {t("logs.requestId")}
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            maxLength={36}
            autoComplete="off"
            disabled={busy}
            placeholder={t("logs.requestPlaceholder")}
          />
        </label>
        <button className={buttonClass} disabled={busy} type="submit">
          {t("logs.apply")}
        </button>
        <button
          className={buttonClass}
          disabled={busy}
          type="button"
          onClick={() => startLoad(applied)}
        >
          {t("logs.refresh")}
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">{t("logs.retention")}</p>
        <button
          className={buttonClass}
          type="button"
          onClick={download}
          disabled={busy || !page?.entries.length}
        >
          {t("logs.download")}
        </button>
      </div>
      <p role="status" className="text-sm text-slate-600">
        {busy
          ? t("logs.loading")
          : message
            ? t(message, { count: messageCount })
            : ""}
      </p>
      <ul className="space-y-3">
        {page?.entries.map((entry) => (
          <li
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"
            key={entry.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-950">{entry.event}</h2>
              <span
                className={
                  entry.level === "error"
                    ? "text-sm font-semibold text-rose-700"
                    : "text-sm text-slate-600"
                }
              >
                {entry.level === "error"
                  ? t("logs.errors")
                  : t("logs.information")}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              <time dateTime={entry.time}>
                {new Date(entry.time).toLocaleString(locale)}
              </time>
              {entry.status ? ` · HTTP ${entry.status}` : ""}
              {entry.errorCode ? ` · ${entry.errorCode}` : ""}
            </p>
            <p className="mt-2 text-xs break-all text-slate-600">
              {t("logs.requestId")}: {entry.requestId}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-indigo-700">
                {t("logs.details")}
              </summary>
              <pre className="mt-3 rounded-lg bg-slate-50 p-3 text-xs break-all whitespace-pre-wrap">
                {JSON.stringify(entry, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      {page?.next && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => startLoad(applied, page.next)}
        >
          {t("logs.older")}
        </button>
      )}
    </section>
  );
}
