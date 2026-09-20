import { Database } from "lucide-react";
import type { Metadata } from "next";

import { MetricCard } from "@/components/data/metric-card";
import { Badge } from "@/components/ui/badge";
import { notConnected } from "@/types/data";
import type { DataPoint } from "@/types/data";

export const metadata: Metadata = {
  title: "Executive Dashboard · TANIA",
};

/**
 * Executive Dashboard shell — TANIA_PRD_v2.0.md §26 (S02).
 *
 * Every metric below is `not-connected`. No value is invented: the database,
 * RLS and domain services that would supply these numbers do not exist yet
 * (Phases 2-4, 8-12). The cards establish layout and the metric contract; the
 * DataPoint type makes it impossible to render a figure without provenance.
 */
const DASHBOARD_METRICS: ReadonlyArray<{
  label: string;
  description: string;
  point: DataPoint<number>;
}> = [
  {
    label: "Talent Health Index",
    description: "PRD §62 — composite of capability, performance and workload.",
    point: notConnected(9, "performance_metrics + talent_profiles"),
  },
  {
    label: "Capability Coverage",
    description: "PRD §62 — share of required capabilities met at target level.",
    point: notConnected(8, "capabilities + talent_capabilities"),
  },
  {
    label: "Critical Capability Gaps",
    description: "PRD §7.3 — required minus current, weighted by criticality.",
    point: notConnected(8, "capability gap engine"),
  },
  {
    label: "Development Progress",
    description: "PRD §62 — completion across active development plans.",
    point: notConnected(10, "development_plans + learning_evidence"),
  },
  {
    label: "AI Augmentation Index",
    description: "PRD §62 — measured AI leverage across the chapter.",
    point: notConnected(13, "ai_usage + ai_augmentation"),
  },
  {
    label: "Business Impact",
    description: "PRD §35 — validated impact, human-approved only.",
    point: notConnected(12, "business_impacts + validation workflow"),
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-telkom-navy)]">
            Executive Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chapter Digital Product &amp; Solution · Telkom Indonesia
          </p>
        </div>
        <Badge variant="outline" className="h-6">
          Shell only
        </Badge>
      </div>

      <div
        role="note"
        className="mt-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
      >
        <Database
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-amber-700"
        />
        <div className="text-sm">
          <p className="font-medium text-amber-900">
            No data source is connected.
          </p>
          <p className="mt-0.5 text-amber-800">
            This is the Phase 1 layout shell. No database, authentication or
            domain service exists yet, so no figure is displayed. Every card
            below states which phase will supply it. Nothing here is sample or
            demonstration data.
          </p>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="chapter-intelligence">
        <h2
          id="chapter-intelligence"
          className="text-sm font-medium tracking-wide text-slate-500 uppercase"
        >
          Chapter Intelligence
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DASHBOARD_METRICS.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              description={metric.description}
              point={metric.point}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
