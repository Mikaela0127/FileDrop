"use client";

import { useId, useRef, useState } from "react";

type Action = "share" | "expire" | "remove";
const buttonClass =
  "rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const messages: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Sign in again before managing files.",
  UPLOAD_GRANT_ACTIVE:
    "Deletion is temporarily blocked while the upload authorization settles. Try again 30 minutes after the file was created.",
  FILE_NOT_AVAILABLE:
    "This file is no longer available. Refresh file activity.",
  FILE_NOT_EXPIRED: "Only expired files can be removed.",
  FILE_BUSY:
    "Another cleanup operation is running. Wait a moment and try again.",
  CONFIRMATION_REQUIRED:
    "This older file requires confirmation to replace its original link. Refresh and try again.",
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
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [action, setAction] = useState<Action>("expire");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  function confirm(next: Action) {
    setMessage("");
    setAction(next);
    setDialogOpen(true);
    dialog.current?.showModal();
  }

  async function run(next: Action, confirmed = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
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
        setMessage("Link retrieved. Copy it using the button below.");
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
          ? ` Reference: ${requestId}.`
          : "";
      setMessage(
        (messages[code] ??
          "The operation could not be completed. Refresh to check the current state before retrying.") +
          safeId,
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const title =
    action === "expire"
      ? "Expire this file?"
      : action === "remove"
        ? "Delete this record?"
        : "Replace the original share link?";
  const description =
    action === "expire"
      ? "New downloads through the share link will stop. Previously issued storage links may remain valid for up to 5 minutes; an ongoing download may finish. This cannot be undone."
      : action === "remove"
        ? "FileDrop will delete any remaining stored object before permanently removing this record and its download statistics. Failed cleanup retains the record for retry. This cannot be undone."
        : "This older file has no recoverable link. Creating one will invalidate its previous share link. Previously issued storage links can remain valid briefly. Future retrievals will return this same new link.";

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
                ? "Get share link"
                : "Create replacement link"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => confirm("expire")}
            >
              Expire file
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
            {status === "DELETING" ? "Retry deletion" : "Delete record"}
          </button>
        )}
      </div>
      {shareUrl && (
        <div className="mt-4">
          <label className="text-xs text-slate-600">
            Share link
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
                setMessage("Share link copied.");
              } catch {
                setMessage(
                  "Clipboard unavailable. Select and copy the displayed link manually.",
                );
              }
            }}
          >
            Copy link
          </button>
        </div>
      )}
      {!dialogOpen && (
        <p role="status" className="mt-3 text-xs leading-5 text-slate-600">
          {message}
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
          {message}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setMessage("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${buttonClass} border-rose-300 text-rose-700`}
            disabled={busy}
            onClick={() => void run(action, true)}
          >
            {busy ? "Working…" : "Confirm"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
