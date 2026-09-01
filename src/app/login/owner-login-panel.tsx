"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Status =
  | { kind: "idle"; message: string }
  | { kind: "error" | "success"; message: string };

export function OwnerLoginPanel() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({
    kind: "idle",
    message: "Enter the owner passphrase to create an 8-hour session.",
  });

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("password");

    if (typeof password !== "string" || password.length === 0) {
      setStatus({ kind: "error", message: "Enter your owner passphrase." });
      return;
    }

    setPending(true);
    setStatus({ kind: "idle", message: "Verifying owner passphrase…" });

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
          message:
            "Owner session created. You can now upload files or review private file activity.",
        });
        return;
      }

      setStatus({
        kind: "error",
        message:
          response.status === 429
            ? "Authentication is busy. Wait a few seconds and try again."
            : "Authentication failed. Check the passphrase and server configuration.",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "FileDrop could not reach the authentication endpoint.",
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
          ? { kind: "success", message: "Owner session cleared." }
          : { kind: "error", message: "FileDrop could not clear the session." },
      );
    } catch {
      setStatus({
        kind: "error",
        message: "FileDrop could not reach the authentication endpoint.",
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
            FileDrop owner
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            Private upload access
          </h2>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleLogin}>
        <div>
          <label
            className="mb-2 block text-sm font-medium text-slate-800"
            htmlFor="owner-password"
          >
            Owner passphrase
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
          {pending ? "Working…" : "Create owner session"}
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
        {status.message}
      </p>

      <button
        className="mt-4 w-full rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        onClick={handleLogout}
        type="button"
      >
        Clear current session
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-2xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href="/upload"
        >
          Open upload
        </Link>
        <Link
          className="rounded-2xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href="/files"
        >
          View file activity
        </Link>
      </div>

      <p className="mt-6 text-xs leading-5 text-slate-500">
        The passphrase is sent only to the same-origin FileDrop API over your
        current connection. The resulting session cookie is HttpOnly and cannot
        be read by browser JavaScript.
      </p>
    </div>
  );
}
