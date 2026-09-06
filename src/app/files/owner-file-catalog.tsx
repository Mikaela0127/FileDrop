"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileManagementActions } from "./file-management-actions";
import { useLanguage } from "../../lib/i18n/language-provider";

type FileStatus =
  "PENDING" | "READY" | "FAILED" | "EXPIRED" | "DELETING" | "DELETED";

interface CatalogFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status: FileStatus;
  expiresAt: string;
  downloadCount: number;
  lastDownloadedAt: string | null;
  createdAt: string;
  canRecoverShareLink?: boolean;
  manuallyExpiredAt?: string | null;
}

interface CatalogResponse {
  files: CatalogFile[];
  limit: number;
}

type CatalogState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: CatalogResponse; observedAt: number };

const STATUS_DETAILS: Record<FileStatus, { className: string }> = {
  PENDING: {
    className: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  READY: {
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  FAILED: {
    className: "bg-rose-50 text-rose-800 ring-rose-200",
  },
  EXPIRED: {
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  DELETING: {
    className: "bg-violet-50 text-violet-800 ring-violet-200",
  },
  DELETED: {
    className: "bg-slate-100 text-slate-500 ring-slate-200",
  },
};

function formatBytes(bytes: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes >= 1_000_000_000) {
    return `${formatter.format(bytes / 1_000_000_000)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${formatter.format(bytes / 1_000_000)} MB`;
  }

  if (bytes >= 1_000) {
    return `${formatter.format(bytes / 1_000)} KB`;
  }

  return `${formatter.format(bytes)} B`;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "";
}

function effectiveStatus(file: CatalogFile, now: number): FileStatus {
  if (
    (file.status === "PENDING" || file.status === "READY") &&
    Date.parse(file.expiresAt) <= now
  ) {
    return "EXPIRED";
  }

  return file.status;
}

function isCatalogResponse(value: unknown): value is CatalogResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CatalogResponse>;
  return (
    Number.isSafeInteger(candidate.limit) &&
    typeof candidate.limit === "number" &&
    candidate.limit > 0 &&
    Array.isArray(candidate.files)
  );
}

async function requestCatalog(signal?: AbortSignal): Promise<CatalogState> {
  try {
    const response = await fetch("/api/files", {
      cache: "no-store",
      signal,
    });

    if (response.status === 401) {
      return { kind: "unauthenticated" };
    }

    if (!response.ok) {
      throw new Error("FILES_UNAVAILABLE");
    }

    const body: unknown = await response.json();

    if (!isCatalogResponse(body)) {
      throw new Error("INVALID_RESPONSE");
    }

    return { kind: "ready", data: body, observedAt: Date.now() };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return {
      kind: "error",
      message:
        "FileDrop could not load private file metadata. Check the server and database, then try again.",
    };
  }
}

export function OwnerFileCatalog() {
  const { locale, t } = useLanguage();
  const [state, setState] = useState<CatalogState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialCatalog() {
      try {
        const nextState = await requestCatalog(controller.signal);
        setState(nextState);
      } catch {
        // Abort means the component is gone; no UI state should be updated.
      }
    }

    void loadInitialCatalog();
    return () => controller.abort();
  }, []);

  async function refreshCatalog() {
    setState({ kind: "loading" });
    setState(await requestCatalog());
  }

  const summary = useMemo(() => {
    if (state.kind !== "ready") {
      return undefined;
    }

    return {
      available: state.data.files.filter(
        (file) => effectiveStatus(file, state.observedAt) === "READY",
      ).length,
      authorizations: state.data.files.reduce(
        (total, file) => total + file.downloadCount,
        0,
      ),
    };
  }, [state]);

  if (state.kind === "loading") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="rounded-3xl border border-white/70 bg-white/90 p-8 text-sm text-slate-600 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="status"
      >
        {t("files.loading")}
      </div>
    );
  }

  if (state.kind === "unauthenticated") {
    return (
      <div
        aria-labelledby="catalog-auth-required"
        className="rounded-3xl border border-amber-200 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="region"
      >
        <h2
          className="text-xl font-semibold text-slate-950"
          id="catalog-auth-required"
        >
          {t("common.ownerRequired")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("files.authDescription")}
        </p>
        <Link
          className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          href="/login"
        >
          {t("common.ownerSignIn")}
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        aria-atomic="true"
        aria-live="assertive"
        className="rounded-3xl border border-rose-200 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="alert"
      >
        <h2 className="text-xl font-semibold text-slate-950">
          {t("files.unavailable")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("files.loadError")}
        </p>
        <button
          className="mt-6 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          onClick={() => void refreshCatalog()}
          type="button"
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  const { files, limit } = state.data;
  const now = state.observedAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {t("files.recent")}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t("files.showing", { limit })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/upload"
          >
            {t("files.upload")}
          </Link>
          <button
            aria-controls="owner-file-list"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            onClick={() => void refreshCatalog()}
            type="button"
          >
            {t("files.refresh")}
          </button>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <dt className="text-xs text-slate-400">{t("files.records")}</dt>
          <dd className="mt-2 text-2xl font-semibold">{files.length}</dd>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-950">
          <dt className="text-xs text-emerald-700">
            {t("files.availableNow")}
          </dt>
          <dd className="mt-2 text-2xl font-semibold">
            {summary?.available ?? 0}
          </dd>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-5 text-indigo-950">
          <dt className="text-xs text-indigo-600">{t("files.handoffs")}</dt>
          <dd className="mt-2 text-2xl font-semibold">
            {new Intl.NumberFormat(locale).format(summary?.authorizations ?? 0)}
          </dd>
        </div>
      </dl>

      <div id="owner-file-list">
        {files.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center">
            <h2 className="text-lg font-semibold text-slate-950">
              {t("files.empty")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("files.emptyDescription")}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {files.map((file) => {
              const status = effectiveStatus(file, now);
              const statusDetails = STATUS_DETAILS[status];

              return (
                <li
                  className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_18px_55px_-38px_rgba(34,50,90,0.4)]"
                  key={file.id}
                >
                  <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                    <div className="min-w-0">
                      <h2 className="font-semibold break-words text-slate-950">
                        {file.originalName}
                      </h2>
                      <p className="mt-1 text-xs break-all text-slate-500">
                        {file.contentType}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusDetails.className}`}
                    >
                      {t(`status.${status}`)}
                    </span>
                  </div>

                  <dl className="mt-6 grid grid-cols-1 gap-x-5 gap-y-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">
                        {t("files.size")}
                      </dt>
                      <dd className="mt-1 font-medium text-slate-800">
                        {formatBytes(file.sizeBytes, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        {t("files.downloads")}
                      </dt>
                      <dd className="mt-1 font-medium text-slate-800">
                        {new Intl.NumberFormat(locale).format(
                          file.downloadCount,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        {t("files.created")}
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        <time dateTime={file.createdAt}>
                          {formatDate(file.createdAt, locale) ||
                            t("common.unknown")}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        {t("files.expires")}
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        <time dateTime={file.expiresAt}>
                          {formatDate(file.expiresAt, locale) ||
                            t("common.unknown")}
                        </time>
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">
                        {t("files.lastDownload")}
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {file.lastDownloadedAt ? (
                          <time dateTime={file.lastDownloadedAt}>
                            {formatDate(file.lastDownloadedAt, locale) ||
                              t("common.unknown")}
                          </time>
                        ) : (
                          t("common.never")
                        )}
                      </dd>
                    </div>
                  </dl>
                  {file.manuallyExpiredAt && (
                    <p className="mt-3 text-xs text-slate-600">
                      {t("files.manuallyExpired", {
                        date:
                          formatDate(file.manuallyExpiredAt, locale) ||
                          t("common.unknown"),
                      })}
                    </p>
                  )}
                  <FileManagementActions
                    file={file}
                    status={status}
                    onChanged={refreshCatalog}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="rounded-2xl bg-slate-100 px-5 py-4 text-xs leading-5 text-slate-600">
        {t("files.note")}
      </p>
    </div>
  );
}
