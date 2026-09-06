import type { Metadata } from "next";
import Link from "next/link";
import { OwnerLogs } from "./owner-logs";
import { T } from "../../../lib/i18n/language-provider";

export const metadata: Metadata = {
  title: "Owner logs | FileDrop",
  robots: { index: false, follow: false },
};
export default function OwnerLogsPage() {
  return (
    <main
      className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-10"
      id="main-content"
      tabIndex={-1}
    >
      <Link href="/files" className="text-sm font-semibold text-indigo-700">
        <T id="logs.back" />
      </Link>
      <h1 className="mt-5 text-4xl font-semibold text-slate-950">
        <T id="logs.title" />
      </h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
        <T id="logs.description" />
      </p>
      <OwnerLogs />
    </main>
  );
}
