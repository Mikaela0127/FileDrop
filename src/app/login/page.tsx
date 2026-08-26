import type { Metadata } from "next";

import { OwnerLoginPanel } from "./owner-login-panel";

export const metadata: Metadata = {
  title: "Owner sign in | FileDrop",
  description: "Create a private FileDrop owner session.",
  robots: { index: false, follow: false },
};

export default function OwnerLoginPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="order-2 lg:order-1">
        <p className="text-sm font-semibold tracking-[0.16em] text-indigo-700 uppercase">
          Day 5 authentication
        </p>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          One owner today, replaceable authorization tomorrow.
        </h2>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
          Authentication verifies the passphrase, session management remembers
          the result, and authorization will guard every upload operation at its
          server boundary.
        </p>
      </section>

      <section className="order-1 lg:order-2">
        <OwnerLoginPanel />
      </section>
    </main>
  );
}
