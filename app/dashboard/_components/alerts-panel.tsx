import { CircleAlert, TriangleAlert } from "lucide-react";

import { InsightCard, SectionCard } from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";
import type { DashboardAlert } from "@/lib/dashboard/queries";

/**
 * Alerts.
 *
 * Every alert here is derived from a threshold over real rows, and `source`
 * names the table it came from. Nothing on this panel is an agent's opinion —
 * AI-produced insight arrives with the assistant in Phase 15 and will be
 * labelled as such.
 */
export function AlertsPanel({
  data,
}: {
  data: DataPoint<readonly DashboardAlert[]>;
}) {
  return (
    <SectionCard
      title="Peringatan"
      description="Diturunkan dari data saat ini, bukan dari inferensi AI."
      bodyClassName="divide-y divide-slate-100"
    >
      {!isLive(data) ? (
        <DataStateNotice point={data} />
      ) : data.value.length === 0 ? (
        <p className="text-sm text-slate-500">
          Tidak ada peringatan. Tidak ada yang melampaui ambang batas yang dipantau.
        </p>
      ) : (
        data.value.map((alert) => (
          <InsightCard
            key={alert.id}
            icon={alert.tone === "danger" ? CircleAlert : TriangleAlert}
            tone={alert.tone}
            title={alert.title}
            detail={alert.detail}
            source="Diturunkan dari penugasan"
          />
        ))
      )}
    </SectionCard>
  );
}
