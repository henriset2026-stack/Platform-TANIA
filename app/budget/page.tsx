import { PlugZap } from "lucide-react";
import type { Metadata } from "next";

import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { EXTERNAL_SYSTEMS, integrationState } from "@/types/integration";

export const metadata: Metadata = { title: "Budget · TANIA" };

const STATE_COPY = {
  configured: { tone: "success" as const, label: "Configured" },
  unconfigured: { tone: "warning" as const, label: "Not configured" },
  "not-specified": { tone: "neutral" as const, label: "Integration not specified" },
};

/**
 * Budget (PRD §35).
 *
 * TANIA plans budget; SAP owns commitment and realization. With no
 * integration there is nothing truthful to display, so this page shows the
 * BOUNDARY rather than an empty dashboard that implies figures are merely
 * loading.
 *
 * No figure on this page is estimated, defaulted or carried forward. A
 * fabricated financial number is the most consequential thing this product
 * could get wrong.
 */
export default async function BudgetPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Budget" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "project.read").allowed) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Budget" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold project.read."
        />
      </div>
    );
  }

  const financeSystems = EXTERNAL_SYSTEMS.filter((s) =>
    s.owns.some((o) => o.includes("budget") || o.includes("hours")),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Budget"
        description="Plan is owned by TANIA. Commitment and realization are owned by the finance system."
      />

      <div
        role="note"
        className="flex items-start gap-3 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3"
      >
        <PlugZap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">
            No financial figures are shown because none can be sourced.
          </p>
          <p className="mt-0.5 text-amber-800">
            Committed and realized amounts originate in SAP. Until that
            integration exists, TANIA displays nothing rather than a zero, an
            estimate or a carried-forward figure. An unknown amount and a zero
            amount are different facts, and treating the first as the second
            understates commitment.
          </p>
        </div>
      </div>

      <SectionCard
        title="Integration boundary"
        description="What TANIA owns, and what it does not."
      >
        <ul className="divide-y divide-slate-100">
          {financeSystems.map((system) => {
            const state = integrationState(system);
            const copy = STATE_COPY[state];
            return (
              <li key={system.code} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{system.name}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    System of record for: {system.owns.join(", ")}.
                  </p>
                  {state === "not-specified" ? (
                    <p className="mt-1 text-xs text-slate-500">
                      No integration has been specified. This requires
                      commissioning, not configuration.
                    </p>
                  ) : null}
                </div>
                <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="What TANIA stores"
        description="The schema exists; the data does not."
        headingLevel={3}
      >
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-800">Planned amount</strong> — entered
            in TANIA, owned by TANIA.
          </li>
          <li>
            <strong className="text-slate-800">Committed and realized</strong> —
            stored only alongside their source and sync time. A database
            constraint rejects an external figure with no stated provenance,
            because an unattributable financial figure is indistinguishable
            from a fabricated one.
          </li>
          <li>
            <strong className="text-slate-800">Thresholds</strong> —
            configurable per organization. Alerts fire only on known figures.
          </li>
          <li>
            <strong className="text-slate-800">Reallocation</strong> — recorded
            as a proposal and audited on decision. Money never moves silently.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
