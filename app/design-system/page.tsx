import {
  Database,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { TaniaAvatar, TaniaPresence, TANIA_STATES } from "@/components/brand/tania-avatar";
import {
  CapabilityStatusBadge,
  DataTable,
  EmptyState,
  ErrorState,
  EvidenceCard,
  InsightCard,
  LoadingState,
  MetricCard,
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
  UserIdentity,
  WorkStatusBadge,
  type Column,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OverlaysDemo } from "@/app/design-system/overlays-demo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notConnected } from "@/types/data";
import type { DataPoint } from "@/types/data";
import { CAPABILITY_STATUSES, TONES, WORK_STATUSES } from "@/types/status";

export const metadata: Metadata = { title: "Sistem desain · TANIA" };

/**
 * Design system reference.
 *
 * Shows every component in its real states so regressions are visible and
 * accessibility can be checked with a keyboard and a screen reader.
 *
 * Data-bearing components are shown in NON-LIVE states only. Filling them
 * with invented figures would contradict the provenance contract the same
 * components exist to enforce (CLAUDE.md §2a). Pure presentation components —
 * badges, progress, buttons — show their variants directly, because a
 * progress bar at 60% is a UI state, not a claim about anyone.
 */

interface DemoRow {
  id: string;
  project: string;
  progress: number;
  status: (typeof WORK_STATUSES)[number];
}

const DEMO_COLUMNS: readonly Column<DemoRow>[] = [
  { id: "project", header: "Proyek", cell: (r) => r.project },
  {
    id: "progress",
    header: "Progres",
    cell: (r) => <ProgressMeter value={r.progress} label={`Progres ${r.project}`} />,
    width: "40%",
    hideOnMobile: true,
  },
  {
    id: "status",
    header: "Status",
    align: "end",
    cell: (r) => <WorkStatusBadge status={r.status} />,
  },
];

const NO_ROWS: DataPoint<readonly DemoRow[]> = notConnected(12, "projects table");

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        title="Sistem desain"
        description="Referensi komponen TANIA — bahasa visual enterprise Telkom, state aksesibilitas, dan kontrak provenance."
        action={<Badge variant="outline">Fase 5</Badge>}
      />

      <div className="space-y-8">
        <SectionCard
          title="Avatar TANIA"
          description="AI employee DPS. State kehadiran dari PRD §80.3. Potret resmi adalah aset brand yang disediakan melalui portraitSrc; monogram adalah fallback-nya."
        >
          <div className="flex flex-wrap items-end gap-6">
            {TANIA_STATES.map((state) => (
              <div key={state} className="flex flex-col items-center gap-2">
                <TaniaAvatar state={state} size="lg" />
                <span className="text-xs text-slate-500">{state}</span>
              </div>
            ))}
          </div>
          <TaniaPresence state="idle" className="mt-6" />
        </SectionCard>

        <SectionCard
          title="Status"
          description="Warna tidak pernah menjadi satu-satunya sinyal — setiap badge memiliki label teks dan titik non-warna."
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Capability</p>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_STATUSES.map((s) => (
                  <CapabilityStatusBadge key={s} status={s} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Pekerjaan</p>
              <div className="flex flex-wrap gap-2">
                {WORK_STATUSES.map((s) => (
                  <WorkStatusBadge key={s} status={s} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Tone</p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <StatusBadge key={tone} tone={tone}>
                    {tone}
                  </StatusBadge>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Metrik"
          description="Keenamnya tampil sebagai belum terhubung: belum ada database, dan demo tata letak bukan alasan untuk mengarang angka."
          bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <MetricCard label="Total Talent" icon={Users} tone="info" point={notConnected(7, "profiles")} />
          <MetricCard label="Indeks Kinerja" icon={TrendingUp} tone="success" point={notConnected(9, "performance_metrics")} />
          <MetricCard label="Cakupan Capability" icon={Layers} tone="info" point={notConnected(8, "talent_capabilities")} />
          <MetricCard label="Adopsi AI" icon={Sparkles} tone="info" point={notConnected(13, "ai_usage")} />
          <MetricCard label="Progres Pengembangan" icon={GraduationCap} tone="warning" point={notConnected(10, "development_plans")} />
          <MetricCard label="Gap Kritis" icon={Target} tone="danger" point={notConnected(8, "capability_requirements")} />
        </SectionCard>

        <SectionCard title="Tab" description="Segmented control, dapat dinavigasi dengan tombol panah keyboard.">
          <Tabs defaultValue="individual">
            <TabsList>
              <TabsTrigger value="individual">Individu</TabsTrigger>
              <TabsTrigger value="squad">Squad</TabsTrigger>
              <TabsTrigger value="chapter">Chapter DPS</TabsTrigger>
            </TabsList>
            <TabsContent value="individual" className="pt-4 text-sm text-slate-600">
              Cakupan individu.
            </TabsContent>
            <TabsContent value="squad" className="pt-4 text-sm text-slate-600">
              Cakupan Squad — Manager hanya melihat Squad yang ia kelola.
            </TabsContent>
            <TabsContent value="chapter" className="pt-4 text-sm text-slate-600">
              Cakupan Chapter.
            </TabsContent>
          </Tabs>
        </SectionCard>

        <SectionCard
          title="Tabel data"
          description="Terikat ke DataPoint, sehingga tidak dapat menampilkan isi kosong ketika kondisi sebenarnya 'belum terhubung'."
        >
          <DataTable
            caption="Proyek aktif"
            columns={DEMO_COLUMNS}
            data={NO_ROWS}
            getRowId={(row) => row.id}
          />
        </SectionCard>

        <SectionCard
          title="Insight"
          description="Setiap insight menyebutkan asalnya. Klaim AI tanpa provenance bukanlah fakta."
          bodyClassName="divide-y divide-slate-100"
        >
          <InsightCard
            icon={Target}
            tone="danger"
            title="Gap capability kritis terdeteksi"
            detail="Memerlukan capability_requirements dan talent_capabilities"
            source="Capability Agent"
            confidence={0}
          />
          <InsightCard
            icon={Sparkles}
            tone="info"
            title="Analisis adopsi AI"
            detail="Memerlukan ai_usage"
            source="AI Augmentation Agent"
          />
        </SectionCard>

        <SectionCard
          title="Bukti"
          description="Sumber, tanggal, status validasi, dan asal selalu ditampilkan."
          bodyClassName="grid gap-3 md:grid-cols-2"
        >
          <EvidenceCard
            title="Bukti capability (tervalidasi)"
            description="Mengilustrasikan state tervalidasi."
            sourceType="project_deliverable"
            sourceReference="SAMPLE-PRJ-1"
            occurredAt="2026-08-14T00:00:00.000Z"
            validationStatus="validated"
            validatedBy="Chapter Lead"
          />
          <EvidenceCard
            title="Bukti kinerja (dihasilkan AI, menunggu)"
            description="Klaim yang dihasilkan AI ditandai dan tetap menunggu sampai divalidasi manusia."
            sourceType="agent_analysis"
            occurredAt="2026-09-02T00:00:00.000Z"
            validationStatus="pending"
            origin="ai_generated"
          />
        </SectionCard>

        <SectionCard
          title="State"
          description="Setiap permukaan data wajib menangani ketiganya."
          bodyClassName="grid gap-4 md:grid-cols-3"
        >
          <EmptyState title="Belum ada data" description="Kueri tidak mengembalikan baris apa pun." />
          <LoadingState label="Contoh memuat" rows={3} />
          <ErrorState detail="req_00000000" />
        </SectionCard>

        <SectionCard title="Progres dan identitas">
          <div className="max-w-sm space-y-4">
            <ProgressMeter value={76} label="Contoh penyelesaian" />
            <ProgressMeter value={30} label="Contoh penyelesaian, lebih rendah" />
            <UserIdentity name="Chapter Lead" role="Chapter DPS" />
          </div>
        </SectionCard>

        <SectionCard
          title="Overlay"
          description="Modal, drawer, dan dropdown. Ketiganya mengunci fokus, tertutup dengan Escape, dan mengembalikan fokus ke pemicunya."
        >
          <OverlaysDemo />
        </SectionCard>

        <SectionCard title="Tombol">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>
              <Database aria-hidden="true" className="size-4" />
              Disabled
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
