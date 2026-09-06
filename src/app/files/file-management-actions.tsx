"use client";

import { useId, useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n/language-provider";
import type { TranslationKey } from "../../lib/i18n/translations";

type Action = "share" | "expire" | "remove";
const buttonClass =
  "rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const messageKeys: Record<string, TranslationKey> = {
  UNAUTHENTICATED: "manage.UNAUTHENTICATED",
  UPLOAD_GRANT_ACTIVE: "manage.UPLOAD_GRANT_ACTIVE",
  FILE_NOT_AVAILABLE: "manage.FILE_NOT_AVAILABLE",
  FILE_NOT_EXPIRED: "manage.FILE_NOT_EXPIRED",
  FILE_BUSY: "manage.FILE_BUSY",
  CONFIRMATION_REQUIRED: "manage.CONFIRMATION_REQUIRED",
};

export function FileManagementActions({
  file,
  status,
  onChanged,
}: {
  file: { id: string; originalName: string; canRecoverShareLink?: boolean };
  status: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [action, setAction] = useState<Action>("expire");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TranslationKey>();
  const [referenceId, setReferenceId] = useState<string>();
  const [shareUrl, setShareUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  function confirm(next: Action) {
    setMessage(undefined);
    setReferenceId(undefined);
    setAction(next);
    setDialogOpen(true);
    dialog.current?.showModal();
  }

  async function run(next: Action, confirmed = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage(undefined);
    setReferenceId(undefined);
    let requestId: string | null = null;
    try {
      const response = await fetch(
        `/api/files/${encodeURIComponent(file.id)}${next === "remove" ? "" : `/${next}`}`,
        {
          method: next === "remove" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed }),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        },
      );
      requestId = response.headers.get("X-Request-ID");
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.code ?? "REQUEST_FAILED");
      if (next === "share") {
        const url = new URL(body.url);
        if (
          url.origin !== window.location.origin ||
          !/^\/d\/[A-Za-z0-9_-]{43}$/u.test(url.pathname) ||
          url.search ||
          url.hash
        )
          throw new Error("INVALID_RESPONSE");
        setShareUrl(url.toString());
        setMessage("manage.retrieved");
        dialog.current?.close();
        setDialogOpen(false);
      } else {
        dialog.current?.close();
        setDialogOpen(false);
        await onChanged();
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const safeId =
        requestId && /^[a-f0-9-]{36}$/iu.test(requestId)
          ? requestId
          : undefined;
      setReferenceId(safeId);
      setMessage(messageKeys[code] ?? "manage.genericError");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const title =
    action === "expire"
      ? t("manage.expireTitle")
      : action === "remove"
        ? t("manage.deleteTitle")
        : t("manage.replaceTitle");
  const description =
    action === "expire"
      ? t("manage.expireDescription")
      : action === "remove"
        ? t("manage.deleteDescription")
        : t("manage.replaceDescription");

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap gap-2">
        {status === "READY" && (
          <>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                file.canRecoverShareLink || shareUrl
                  ? void run("share")
                  : confirm("share")
              }
            >
              {file.canRecoverShareLink || shareUrl
                ? t("manage.getLink")
                : t("manage.createLink")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => confirm("expire")}
            >
              {t("manage.expire")}
            </button>
          </>
        )}
        {["EXPIRED", "DELETED", "DELETING"].includes(status) && (
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => confirm("remove")}
          >
            {status === "DELETING"
              ? t("manage.retryDelete")
              : t("manage.delete")}
          </button>
        )}
      </div>
      {shareUrl && (
        <div className="mt-4">
          <label className="text-xs text-slate-600">
            {t("manage.shareLink")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            className={`${buttonClass} mt-2`}
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setMessage("manage.copied");
              } catch {
                setMessage("manage.copyFailed");
              }
            }}
          >
            {t("manage.copy")}
          </button>
        </div>
      )}
      {!dialogOpen && (
        <p role="status" className="mt-3 text-xs leading-5 text-slate-600">
          {message ? t(message) : ""}
          {referenceId ? ` ${t("common.reference", { id: referenceId })}` : ""}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setDialogOpen(false)}
        onCancel={(event) => {
          if (locked.current) event.preventDefault();
        }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-6 shadow-xl backdrop:bg-slate-950/50"
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-950">
          {title}
        </h3>
        <p className="mt-2 text-sm font-medium break-words text-slate-800">
          {file.originalName}
        </p>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-slate-600">
          {description}
        </p>
        <p role="status" className="mt-3 text-sm text-rose-700">
          {message ? t(message) : ""}
          {referenceId ? ` ${t("common.reference", { id: referenceId })}` : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setMessage(undefined);
              setReferenceId(undefined);
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`${buttonClass} border-rose-300 text-rose-700`}
            disabled={busy}
            onClick={() => void run(action, true)}
          >
            {busy ? t("common.working") : t("common.confirm")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
