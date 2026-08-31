import type { Metadata } from "next";

import { OwnerUploadPanel } from "./owner-upload-panel";

export const metadata: Metadata = {
  title: "Owner upload | FileDrop",
  description: "Upload and verify a private FileDrop object.",
  robots: { index: false, follow: false },
};

export default function OwnerUploadPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="order-2 lg:order-1">
        <p className="text-sm font-semibold tracking-[0.16em] text-indigo-700 uppercase">
          Day 6 upload pipeline
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          The application controls access. R2 carries the bytes.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
          FileDrop creates a 15-minute upload authorization, sends the file
          directly to the private bucket, then verifies the actual R2 metadata
          before marking it ready.
        </p>
        <a
          className="mt-6 inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          href="/files"
        >
          View file activity
        </a>
      </section>

      <section className="order-1 lg:order-2">
        <OwnerUploadPanel />
      </section>
    </main>
  );
}
