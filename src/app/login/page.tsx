import type { Metadata } from "next";

import { OwnerLoginPanel } from "./owner-login-panel";

export const metadata: Metadata = {
  title: "Owner sign in | FileDrop",
  description: "Create a private FileDrop owner session.",
  robots: { index: false, follow: false },
};

export default function OwnerLoginPage() {
  return (
    <main
      className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-10 sm:py-16 lg:grid-cols-[0.8fr_1.2fr]"
      id="main-content"
      tabIndex={-1}
    >
      <section className="order-2 lg:order-1">
        <p className="text-sm font-semibold tracking-[0.16em] text-indigo-700 uppercase">
          Owner authentication
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          One owner today, replaceable authorization tomorrow.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
          Authentication verifies the passphrase, creates a signed session, and
          protects every private upload and metadata request at its server
          boundary.
        </p>
      </section>

      <section className="order-1 lg:order-2">
        <OwnerLoginPanel />
      </section>
    </main>
  );
}
