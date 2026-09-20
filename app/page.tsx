import { PHASES, statusCounts } from "@/lib/status";

const STATUS_STYLES: Record<string, string> = {
  IMPLEMENTED: "bg-emerald-100 text-emerald-900",
  PARTIALLY_IMPLEMENTED: "bg-amber-100 text-amber-900",
  PLANNED: "bg-slate-100 text-slate-600",
  MISSING: "bg-red-100 text-red-900",
};

export default function Home() {
  const counts = statusCounts();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium tracking-widest text-[--color-telkom-blue] uppercase">
        Chapter DPS · Telkom Indonesia
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-[--color-telkom-navy]">
        TANIA
      </h1>
      <p className="mt-2 text-slate-600">
        Talent Intelligence, Analytics, Insight &amp; Action
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[--color-telkom-navy]">
          Implementation status
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {counts.IMPLEMENTED} implemented · {counts.PARTIALLY_IMPLEMENTED}{" "}
          partial · {counts.PLANNED} planned
        </p>

        <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {PHASES.map((phase) => (
            <li
              key={phase.id}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <span className="text-sm text-slate-800">
                <span className="mr-2 tabular-nums text-slate-400">
                  {String(phase.id).padStart(2, "0")}
                </span>
                {phase.name}
              </span>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  STATUS_STYLES[phase.status] ?? ""
                }`}
              >
                {phase.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
