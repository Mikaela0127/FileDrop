import type { Metadata } from "next";
import Link from "next/link";
import { OwnerLogs } from "./owner-logs";

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
        Back to file activity
      </Link>
      <h1 className="mt-5 text-4xl font-semibold text-slate-950">Owner logs</h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
        Recent errors and file operations, with private values excluded. Keep a
        request ID when reporting a problem. Database outages and hard crashes
        may only appear in Vercel logs.
      </p>
      <OwnerLogs />
    </main>
  );
}
