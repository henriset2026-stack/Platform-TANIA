# UI Glossary — Bahasa Indonesia

The portal UI is Indonesian by default (PRD-TANIA v1.2 §5.6 and §7; reconciliation ruling R-10).
Technical and module terms stay English where the Chapter already uses them in English (v1.2 §5.6).
Use this table so the same concept reads the same everywhere.

## Kept in English

Dashboard, Executive Dashboard, Talent, Capability, Workload, Feasibility, Budget, Chapter, Tribe,
Squad, Manager, Chapter Leader, Project Manager, Product Manager, Business Analyst, SCALE
(Synergize, Customer & Culture, Automate, Lead, Expand), TANIA, JARVIS, AI, RAG, SSO, Entra ID,
L1–L5 level names, KPI, OKR, IDP, heatmap, bench, gap, sprint, template, filter.

## Translated

| English | Indonesian |
|---|---|
| Performance (area / nav) | Kinerja |
| Performance review | Penilaian kinerja |
| Development | Pengembangan |
| Development plan | Rencana pengembangan |
| Work & Assignment / Assignment | Penugasan |
| Project(s) | Proyek |
| Knowledge | Pengetahuan |
| Audit log | Log audit |
| Evidence | Bukti |
| Recommendation | Rekomendasi |
| Assessment | Asesmen |
| Review (noun) / Reviewer | Tinjauan / Peninjau |
| Approve / Approved | Setujui / Disetujui |
| Reject / Rejected | Tolak / Ditolak |
| Submit / Submitted | Ajukan / Diajukan |
| Draft | Draf |
| Pending | Menunggu |
| Validated / Verified | Tervalidasi / Terverifikasi |
| Utilization | Utilisasi |
| Underloaded / Healthy / Overloaded | Under / Optimal / Over |
| Capacity | Kapasitas |
| Headcount | Jumlah talent |
| Business impact | Dampak bisnis |
| Coverage | Cakupan |
| Confidence | Tingkat keyakinan |
| Source / Sources | Sumber |
| Period | Periode |
| Search | Cari |
| Sign in / Sign out | Masuk / Keluar |
| Open … | Buka … |
| Back | Kembali |
| Next / Previous | Berikutnya / Sebelumnya |
| Loading… | Memuat… |
| Something went wrong | Terjadi kesalahan |
| Try again | Coba lagi |
| Not found | Tidak ditemukan |
| No data source | Belum ada sumber data |
| Not authorized | Tidak berwenang |
| No results / Empty | Tidak ada hasil / Belum ada data |
| Implemented / Partial / Planned | Selesai / Sebagian / Direncanakan |
| Ask TANIA | Tanya TANIA |
| Intelligence (section title) | Intelijen |
| Insight(s) | Wawasan |
| Over-allocated | Alokasi berlebih (badge: Over) |
| Online (assistant presence) | Daring |
| Close | Tutup |
| Clear (filters) | Hapus |
| Not signed in | Belum masuk |
| Strong / On track / Needs attention / Critical gap | Kuat / Sesuai jalur / Perlu perhatian / Gap kritis |
| In progress / At risk / Delayed / Completed / Cancelled | Berjalan / Berisiko / Terlambat / Selesai / Dibatalkan |
| Fact / Analysis / AI inference | Fakta / Analisis / Inferensi AI |

## Not yet translated

- Raw database values rendered as they are stored (e.g. `row.status`, `criticality`, `sensitivity`).
  Each needs a label map; add one per enum rather than translating in the component.
- Labels that also feed agent tool output (`PERFORMANCE_DIMENSIONS`, `provenReason`) and all agent
  output: agent language is a separate decision.
- Dates rendered as ISO text (`YYYY-MM-DD`).

## Rules

- Translate what a person reads: text, headings, buttons, placeholders, `aria-label`, `title`, `alt`,
  page `metadata`, empty/error states.
- Never translate identifiers: role codes (`CHAPTER_LEAD`), permission strings, database values and
  enums, route paths, `data-*` / test ids, error codes, log messages.
- Agent and model prompts and agent output are out of scope. The assistant understands Indonesian and
  English (v1.2 §7).
- Number and date formatting uses the `id-ID` locale.
- Address the user as *Anda*; keep sentences short and formal-neutral.
