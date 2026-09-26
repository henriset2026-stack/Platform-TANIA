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
  configured: { tone: "success" as const, label: "Terkonfigurasi" },
  unconfigured: { tone: "warning" as const, label: "Belum dikonfigurasi" },
  "not-specified": { tone: "neutral" as const, label: "Integrasi belum ditentukan" },
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
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "project.read").allowed) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Budget" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin project.read."
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
        description="Rencana dimiliki TANIA. Komitmen dan realisasi dimiliki sistem keuangan."
      />

      <div
        role="note"
        className="flex items-start gap-3 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3"
      >
        <PlugZap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">
            Tidak ada angka keuangan yang ditampilkan karena belum ada sumbernya.
          </p>
          <p className="mt-0.5 text-amber-800">
            Nilai komitmen dan realisasi berasal dari SAP. Sampai integrasi
            tersebut tersedia, TANIA tidak menampilkan apa pun — bukan nol,
            estimasi, atau angka yang dibawa dari periode sebelumnya. Nilai yang
            tidak diketahui dan nilai nol adalah fakta yang berbeda, dan
            menyamakan keduanya membuat komitmen tampak lebih kecil.
          </p>
        </div>
      </div>

      <SectionCard
        title="Batas integrasi"
        description="Apa yang dimiliki TANIA, dan apa yang tidak."
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
                    Sistem acuan untuk: {system.owns.join(", ")}.
                  </p>
                  {state === "not-specified" ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Belum ada integrasi yang ditentukan. Ini memerlukan
                      pengadaan, bukan sekadar konfigurasi.
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
        title="Yang disimpan TANIA"
        description="Skemanya sudah ada; datanya belum."
        headingLevel={3}
      >
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-800">Nilai rencana</strong> — diinput
            di TANIA, dimiliki TANIA.
          </li>
          <li>
            <strong className="text-slate-800">Komitmen dan realisasi</strong> —
            hanya disimpan bersama sumber dan waktu sinkronisasinya. Constraint
            database menolak angka eksternal tanpa provenance yang jelas,
            karena angka keuangan yang tidak dapat ditelusuri asalnya tidak
            dapat dibedakan dari angka rekaan.
          </li>
          <li>
            <strong className="text-slate-800">Ambang batas</strong> —
            dapat dikonfigurasi per organisasi. Peringatan hanya muncul untuk angka yang diketahui.
          </li>
          <li>
            <strong className="text-slate-800">Realokasi</strong> — dicatat
            sebagai usulan dan diaudit saat diputuskan. Dana tidak pernah berpindah diam-diam.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
