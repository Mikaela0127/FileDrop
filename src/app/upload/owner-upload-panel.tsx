"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "../../lib/i18n/language-provider";
import type { TranslationKey } from "../../lib/i18n/translations";
import {
  reportClientFailure,
  type ClientFailureStage,
} from "../../lib/operations/client-diagnostics";

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

const stageMessages: Record<UploadStage, TranslationKey> = {
  idle: "upload.idle",
  preparing: "upload.preparing",
  uploading: "upload.uploading",
  verifying: "upload.verifying",
  success: "upload.success",
  error: "upload.error",
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

function errorMessage(code: string | undefined): TranslationKey {
  switch (code) {
    case "UNAUTHENTICATED":
      return "upload.unauthenticated";
    case "FORBIDDEN_ORIGIN":
      return "upload.forbidden";
    case "INVALID_UPLOAD":
      return "upload.invalid";
    case "OBJECT_MISMATCH":
      return "upload.mismatch";
    case "UPLOAD_EXPIRED":
      return "upload.expired";
    case "OBJECT_NOT_FOUND":
      return "upload.notFound";
    default:
      return "upload.genericError";
  }
}

export function OwnerUploadPanel() {
  const { locale, t } = useLanguage();
  const [access, setAccess] = useState<AccessState>("checking");
  const [stage, setStage] = useState<UploadStage>("idle");
  const [message, setMessage] = useState(stageMessages.idle);
  const [messageValues, setMessageValues] = useState<Record<string, string>>();
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
      setMessage("upload.nonEmpty");
      setMessageValues(undefined);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStage("error");
      setMessage("upload.tooLarge");
      setMessageValues({ size: MAX_FILE_SIZE_LABEL });
      return;
    }

    setResult(undefined);
    setStage("preparing");
    setMessage(stageMessages.preparing);
    setMessageValues(undefined);

    let failureStage: ClientFailureStage = "initialize";
    let diagnosticFileId: string | undefined;
    let diagnosticRequestId: string | null = null;

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

      diagnosticRequestId = initializeResponse.headers.get("X-Request-ID");
      if (!initializeResponse.ok) {
        const code = await readErrorCode(initializeResponse);
        if (code === "UNAUTHENTICATED") {
          setAccess("unauthenticated");
        }
        throw new Error(code ?? "INITIALIZE_FAILED");
      }

      const initialized =
        (await initializeResponse.json()) as InitializedUpload;
      diagnosticFileId = initialized.fileId;
      failureStage = "direct-upload";

      setStage("uploading");
      setMessage(stageMessages.uploading);
      setMessageValues(undefined);

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
      failureStage = "complete";
      setMessage(stageMessages.verifying);
      setMessageValues(undefined);

      const completionResponse = await fetch(
        `/api/uploads/${encodeURIComponent(initialized.fileId)}/complete`,
        { method: "POST" },
      );

      diagnosticRequestId = completionResponse.headers.get("X-Request-ID");
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
      setMessageValues(undefined);
    } catch (error) {
      reportClientFailure(failureStage, diagnosticFileId);
      const code = error instanceof Error ? error.message : undefined;
      setStage("error");
      setMessage(
        code === "DIRECT_UPLOAD_FAILED"
          ? "upload.directFailed"
          : errorMessage(code),
      );
      setMessageValues(
        diagnosticRequestId && /^[a-f0-9-]{36}$/iu.test(diagnosticRequestId)
          ? { referenceId: diagnosticRequestId }
          : undefined,
      );
    }
  }

  async function copySharePath() {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setMessage("upload.copied");
      setMessageValues(undefined);
    } catch {
      setMessage("upload.copyFailed");
      setMessageValues(undefined);
    }
  }

  if (access === "checking") {
    return (
      <div
        aria-live="polite"
        className="rounded-3xl border border-white/70 bg-white/90 p-8 text-sm text-slate-600 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)]"
        role="status"
      >
        {t("upload.checking")}
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
          {t("common.ownerRequired")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("upload.authDescription")}
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
            {t("upload.file")}
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
            {t("upload.fileHelp", { size: MAX_FILE_SIZE_LABEL })}
          </p>
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-medium text-slate-800"
            htmlFor="expiration-seconds"
          >
            {t("upload.deleteAfter")}
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
                {t(`expiry.${option.seconds}` as TranslationKey)}
              </option>
            ))}
          </select>
          <p
            className="mt-2 text-xs leading-5 text-slate-500"
            id="expiration-help"
          >
            {t("upload.expiryHelp")}
          </p>
        </div>

        <button
          className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? t("upload.progress") : t("upload.submit")}
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
        {t(message, messageValues)}
        {messageValues?.referenceId
          ? ` ${t("common.reference", { id: messageValues.referenceId })}`
          : ""}
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
            {t("upload.ready", { name: result.fileName })}
          </h2>
          <p className="mt-1 text-xs text-emerald-800">
            {t("upload.expires", {
              date: new Date(result.fileExpiresAt).toLocaleString(locale),
            })}
          </p>
          <code className="mt-4 block rounded-xl bg-white px-3 py-2 text-xs break-all whitespace-normal text-slate-700">
            {result.shareUrl}
          </code>
          <button
            className="mt-3 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            onClick={copySharePath}
            type="button"
          >
            {t("upload.copy")}
          </button>
          <p className="mt-3 text-xs leading-5 text-emerald-800">
            {t("upload.tokenWarning")}
          </p>
        </section>
      ) : null}
    </div>
  );
}
