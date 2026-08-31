import {
  EXPIRATION_OPTIONS,
  MAX_FILE_SIZE_LABEL,
} from "@/modules/files/domain/file-policy";

const foundations = [
  "Next.js 16 App Router with strict TypeScript",
  "PostgreSQL metadata, private R2 object storage",
  "Owner-only uploads for the initial release",
  "Direct browser uploads with short-lived signed URLs",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
      <section className="w-full rounded-3xl border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_-32px_rgba(34,50,90,0.35)] backdrop-blur sm:p-12">
        <div className="mb-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
            F
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] text-indigo-700 uppercase">
            FileDrop
          </span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-medium text-indigo-700">
              Engineering foundation ready
            </p>
            <h1 className="max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-slate-950 sm:text-6xl">
              Private file sharing, built to expire.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              FileDrop transfers files through private object storage while
              keeping ownership, metadata, and expiry rules under your control.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                className="inline-flex rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                href="/upload"
              >
                Open owner upload
              </a>
              <a
                className="inline-flex rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                href="/files"
              >
                View file activity
              </a>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <dt className="text-xs text-slate-400">Maximum file</dt>
              <dd className="mt-1 text-xl font-semibold">
                {MAX_FILE_SIZE_LABEL}
              </dd>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-950">
              <dt className="text-xs text-indigo-500">Expiry choices</dt>
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
              {foundation}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
