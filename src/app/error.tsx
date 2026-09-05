"use client";
import { useEffect } from "react";
import { reportClientFailure } from "../lib/operations/client-diagnostics";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientFailure("render");
  }, []);
  return (
    <main className="mx-auto max-w-xl p-8" role="alert">
      <h1 className="text-2xl font-semibold">
        FileDrop could not load this page
      </h1>
      <p className="mt-4">
        Please try again. If this keeps happening, note the time and check the
        deployment logs.
      </p>
      <button
        className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-white"
        onClick={retry}
      >
        Try again
      </button>
    </main>
  );
}
