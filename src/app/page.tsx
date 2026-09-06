import {
  EXPIRATION_OPTIONS,
  MAX_FILE_SIZE_LABEL,
} from "@/modules/files/domain/file-policy";
import Link from "next/link";
import { T } from "../lib/i18n/language-provider";

const foundations = [
  "home.foundation1",
  "home.foundation2",
  "home.foundation3",
  "home.foundation4",
] as const;

export default function Home() {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-10 sm:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <section className="w-full rounded-3xl border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)] backdrop-blur sm:p-12">
        <div className="mb-10 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-lg font-bold text-white"
          >
            F
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] text-indigo-700 uppercase">
            FileDrop
          </span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-medium text-indigo-700">
              <T id="home.eyebrow" />
            </p>
            <h1 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-6xl">
              <T id="home.title" />
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              <T id="home.description" />
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                href="/upload"
              >
                <T id="home.upload" />
              </Link>
              <Link
                className="inline-flex rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                href="/files"
              >
                <T id="home.activity" />
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <dt className="text-xs text-slate-400">
                <T id="home.maxFile" />
              </dt>
              <dd className="mt-1 text-xl font-semibold">
                {MAX_FILE_SIZE_LABEL}
              </dd>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-950">
              <dt className="text-xs text-indigo-500">
                <T id="home.expiryChoices" />
              </dt>
              <dd className="mt-1 text-xl font-semibold">
                {EXPIRATION_OPTIONS.length}
              </dd>
            </div>
          </dl>
        </div>

        <ul className="mt-12 grid gap-3 border-t border-slate-200 pt-8 sm:grid-cols-2">
          {foundations.map((foundation) => (
            <li
              className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
              key={foundation}
            >
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"
              />
              <T id={foundation} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
