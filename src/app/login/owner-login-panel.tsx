"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useLanguage } from "../../lib/i18n/language-provider";
import type { TranslationKey } from "../../lib/i18n/translations";

type Status =
  | { kind: "idle"; message: TranslationKey }
  | { kind: "error" | "success"; message: TranslationKey };

export function OwnerLoginPanel() {
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({
    kind: "idle",
    message: "login.initial",
  });

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("password");

    if (typeof password !== "string" || password.length === 0) {
      setStatus({ kind: "error", message: "login.required" });
      return;
    }

    setPending(true);
    setStatus({ kind: "idle", message: "login.verifying" });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      form.reset();

      if (response.ok) {
        setStatus({
          kind: "success",
          message: "login.success",
        });
        return;
      }

      setStatus({
        kind: "error",
        message: response.status === 429 ? "login.busy" : "login.failed",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "login.unreachable",
      });
    } finally {
      setPending(false);
    }
  }

  async function handleLogout() {
    setPending(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      setStatus(
        response.ok
          ? { kind: "success", message: "login.cleared" }
          : { kind: "error", message: "login.clearFailed" },
      );
    } catch {
      setStatus({
        kind: "error",
        message: "login.unreachable",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      aria-busy={pending}
      className="rounded-3xl border border-white/70 bg-white/90 p-7 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)] backdrop-blur sm:p-10"
    >
      <div className="mb-8 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-lg font-bold text-white"
        >
          F
        </span>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-indigo-700 uppercase">
            {t("login.owner")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {t("login.access")}
          </h2>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleLogin}>
        <div>
          <label
            className="mb-2 block text-sm font-medium text-slate-800"
            htmlFor="owner-password"
          >
            {t("login.passphrase")}
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            disabled={pending}
            id="owner-password"
            maxLength={1024}
            name="password"
            required
            type="password"
          />
        </div>

        <button
          className="w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? t("common.working") : t("login.create")}
        </button>
      </form>

      <p
        aria-atomic="true"
        aria-live={status.kind === "error" ? "assertive" : "polite"}
        className={`mt-5 min-h-12 rounded-2xl px-4 py-3 text-sm leading-6 ${
          status.kind === "error"
            ? "bg-rose-50 text-rose-800"
            : status.kind === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-50 text-slate-600"
        }`}
        role={status.kind === "error" ? "alert" : "status"}
      >
        {t(status.message)}
      </p>

      <button
        className="mt-4 w-full rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        onClick={handleLogout}
        type="button"
      >
        {t("login.clear")}
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-2xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href="/upload"
        >
          {t("login.openUpload")}
        </Link>
        <Link
          className="rounded-2xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href="/files"
        >
          {t("nav.fileActivity")}
        </Link>
      </div>

      <p className="mt-6 text-xs leading-5 text-slate-500">
        {t("login.security")}
      </p>
    </div>
  );
}
