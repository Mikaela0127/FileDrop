"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  EXPIRATION_OPTIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
} from "@/modules/files/domain/file-policy";

type AccessState = "checking" | "authenticated" | "unauthenticated";
type UploadStage =
  "idle" | "preparing" | "uploading" | "verifying" | "success" | "error";

interface InitializedUpload {
  fileId: string;
  fileExpiresAt: string;
  shareToken: string;
  upload: {
    expiresAt: string;
    headers: Record<string, string>;
    method: "PUT";
    url: string;
  };
}

interface UploadResult {
  fileName: string;
  fileExpiresAt: string;
  shareUrl: string;
}

const stageMessages: Record<UploadStage, string> = {
  idle: "Choose one file and an expiration period.",
  preparing: "Creating a short-lived R2 upload authorization…",
  uploading: "Uploading directly from this browser to private object storage…",
  verifying: "Verifying the stored size and content type with R2…",
  success: "Upload verified. The database record is now READY.",
  error: "The upload did not complete safely.",
};

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown };
    };
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "Your owner session is missing or expired. Sign in again.";
    case "FORBIDDEN_ORIGIN":
      return "The server rejected this request origin.";
    case "INVALID_UPLOAD":
      return "The selected file metadata or expiration is invalid.";
    case "OBJECT_MISMATCH":
      return "R2 received metadata that differs from the approved upload. The object was rejected.";
    case "UPLOAD_EXPIRED":
      return "This upload expired before verification finished.";
    case "OBJECT_NOT_FOUND":
      return "R2 could not find the uploaded object yet. Try the upload again.";
    default:
      return "FileDrop could not finish the upload. Check the server and R2 configuration, then try again.";
  }
}

export function OwnerUploadPanel() {
  const [access, setAccess] = useState<AccessState>("checking");
  const [stage, setStage] = useState<UploadStage>("idle");
  const [message, setMessage] = useState(stageMessages.idle);
  const [result, setResult] = useState<UploadResult>();
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const pending =
    stage === "preparing" || stage === "uploading" || stage === "verifying";

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const body = (await response.json()) as { authenticated?: unknown };

        if (active) {
          setAccess(
            response.ok && body.authenticated === true
              ? "authenticated"
              : "unauthenticated",
          );
        }
      } catch {
        if (active) {
          setAccess("unauthenticated");
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (stage === "success") {
      resultHeadingRef.current?.focus();
    }
  }, [stage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const expirationSeconds = Number(formData.get("expirationSeconds"));

    if (!(file instanceof File) || file.size < 1) {
      setStage("error");
      setMessage("Choose a non-empty file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStage("error");
      setMessage(`The maximum file size is ${MAX_FILE_SIZE_LABEL} decimal.`);
      return;
    }

    setResult(undefined);
    setStage("preparing");
    setMessage(stageMessages.preparing);

    try {
      const initializeResponse = await fetch("/api/uploads/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          contentType: file.type || undefined,
          sizeBytes: file.size,
          expirationSeconds,
        }),
      });

      if (!initializeResponse.ok) {
        const code = await readErrorCode(initializeResponse);
        if (code === "UNAUTHENTICATED") {
          setAccess("unauthenticated");
        }
        throw new Error(code ?? "INITIALIZE_FAILED");
      }

      const initialized =
        (await initializeResponse.json()) as InitializedUpload;

      setStage("uploading");
      setMessage(stageMessages.uploading);

      const uploadResponse = await fetch(initialized.upload.url, {
        method: initialized.upload.method,
        headers: initialized.upload.headers,
        body: file,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });

      if (!uploadResponse.ok) {
        throw new Error("DIRECT_UPLOAD_FAILED");
      }

      setStage("verifying");
      setMessage(stageMessages.verifying);

      const completionResponse = await fetch(
        `/api/uploads/${encodeURIComponent(initialized.fileId)}/complete`,
        { method: "POST" },
      );

      if (!completionResponse.ok) {
        const code = await readErrorCode(completionResponse);
        if (code === "UNAUTHENTICATED") {
          setAccess("unauthenticated");
        }
        throw new Error(code ?? "COMPLETION_FAILED");
      }

      setResult({
        fileName: file.name,
        fileExpiresAt: initialized.fileExpiresAt,
        shareUrl: new URL(
          `/d/${initialized.shareToken}`,
          window.location.origin,
        ).toString(),
      });
      form.reset();
      setStage("success");
      setMessage(stageMessages.success);
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      setStage("error");
      setMessage(
        code === "DIRECT_UPLOAD_FAILED"
          ? "R2 rejected or interrupted the direct upload. No file was marked READY."
          : errorMessage(code),
      );
    }
  }

  async function copySharePath() {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setMessage(
        "Share URL copied. Anyone with this link can download the file.",
      );
    } catch {
      setMessage(
        "Could not access the clipboard. Copy the displayed URL manually.",
      );
    }
  }

  if (access === "checking") {
    return (
      <div
        aria-live="polite"
        className="rounded-3xl border border-white/70 bg-white/90 p-8 text-sm text-slate-600 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="status"
      >
        Checking the owner session…
      </div>
    );
  }

  if (access === "unauthenticated") {
    return (
      <div
        aria-labelledby="upload-auth-required"
        className="rounded-3xl border border-amber-200 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="region"
      >
        <h2
          className="text-xl font-semibold text-slate-950"
          id="upload-auth-required"
        >
          Owner session required
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The upload API independently verifies your signed session before it
          creates any R2 authorization.
        </p>
        <Link
          className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          href="/login"
        >
          Go to owner sign in
        </Link>
      </div>
    );
  }

  return (
    <div
      aria-busy={pending}
      className="rounded-3xl border border-white/70 bg-white/90 p-7 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)] backdrop-blur sm:p-10"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
          <label
            className="mb-2 block text-sm font-medium text-slate-800"
            htmlFor="upload-file"
          >
            File
          </label>
          <input
            aria-describedby="upload-file-help"
            className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-semibold file:text-indigo-700"
            disabled={pending}
            id="upload-file"
            name="file"
            required
            type="file"
          />
          <p className="mt-2 text-xs text-slate-500" id="upload-file-help">
            Maximum {MAX_FILE_SIZE_LABEL} (3,000,000,000 bytes). One file per
            upload.
          </p>
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-medium text-slate-800"
            htmlFor="expiration-seconds"
          >
            Delete after
          </label>
          <select
            aria-describedby="expiration-help"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            defaultValue={86_400}
            disabled={pending}
            id="expiration-seconds"
            name="expirationSeconds"
          >
            {EXPIRATION_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
          <p
            className="mt-2 text-xs leading-5 text-slate-500"
            id="expiration-help"
          >
            Download access stops at this time, even if physical cleanup runs
            later.
          </p>
        </div>

        <button
          className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Upload in progress…" : "Upload and verify"}
        </button>
      </form>

      <p
        aria-atomic="true"
        aria-live={stage === "error" ? "assertive" : "polite"}
        className={`mt-6 rounded-2xl px-4 py-3 text-sm leading-6 ${
          stage === "error"
            ? "bg-rose-50 text-rose-800"
            : stage === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-50 text-slate-600"
        }`}
        role={stage === "error" ? "alert" : "status"}
      >
        {message}
      </p>

      {result ? (
        <section
          aria-labelledby="upload-result-heading"
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
        >
          <h2
            className="font-semibold break-words text-emerald-950 outline-none"
            id="upload-result-heading"
            ref={resultHeadingRef}
            tabIndex={-1}
          >
            Upload ready: {result.fileName}
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            Expires {new Date(result.fileExpiresAt).toLocaleString()}
          </p>
          <code className="mt-4 block rounded-xl bg-white px-3 py-2 text-xs break-all whitespace-normal text-slate-700">
            {result.shareUrl}
          </code>
          <button
            className="mt-3 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            onClick={copySharePath}
            type="button"
          >
            Copy share URL
          </button>
          <p className="mt-3 text-xs leading-5 text-emerald-800">
            The token is shown only in this browser session. Treat the URL as a
            password: anyone who has it can download the file until it expires.
          </p>
        </section>
      ) : null}
    </div>
  );
}
