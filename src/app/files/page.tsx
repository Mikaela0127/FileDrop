import type { Metadata } from "next";
import Link from "next/link";

import { OwnerFileCatalog } from "./owner-file-catalog";

export const metadata: Metadata = {
  title: "File activity | FileDrop",
  description: "Review private FileDrop lifecycle and download metadata.",
  robots: { index: false, follow: false },
};

export default function OwnerFileCatalogPage() {
  return (
    <main
      className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-10 sm:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <header className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] text-indigo-700 uppercase">
            Owner file activity
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Metadata you can explain and trust.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Review recent lifecycle state, expiration, and authorized download
            handoffs without exposing private storage identifiers or bearer
            tokens.
          </p>
        </div>
        <Link
          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          href="/"
        >
          Back to FileDrop
        </Link>
      </header>

      <OwnerFileCatalog />
    </main>
  );
}
