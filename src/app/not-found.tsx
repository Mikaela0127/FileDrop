import Link from "next/link";
import { T } from "../lib/i18n/language-provider";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-8">
      <p className="text-sm font-semibold tracking-[0.18em] text-indigo-700">
        404
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-slate-950">
        <T id="error.notFoundTitle" />
      </h1>
      <p className="mt-4 leading-7 text-slate-600">
        <T id="error.notFoundDescription" />
      </p>
      <Link
        className="mt-7 w-fit rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        href="/"
      >
        <T id="nav.backHome" />
      </Link>
    </main>
  );
}
