/**
 * Dashboard component barrel.
 *
 * Import from "@/components/dashboard" so the set stays discoverable and
 * screens do not reach into individual files.
 */
export { ChartCard } from "@/components/dashboard/chart-card";
export { DataTable, type Column } from "@/components/dashboard/data-table";
export { EvidenceCard, type ValidationStatus } from "@/components/dashboard/evidence-card";
export {
  FilterBar,
  type FilterDefinition,
  type FilterOption,
} from "@/components/dashboard/filter-bar";
export { InsightCard } from "@/components/dashboard/insight-card";
export { MetricCard } from "@/components/dashboard/metric-card";
export { ProgressMeter } from "@/components/dashboard/progress-meter";
export { Search } from "@/components/dashboard/search";
export { PageHeader, SectionCard } from "@/components/dashboard/section";
export {
  CapabilityStatusBadge,
  StatusBadge,
  WorkStatusBadge,
} from "@/components/dashboard/status-badge";
export { EmptyState, ErrorState, LoadingState } from "@/components/dashboard/states";
export { UserIdentity, initials } from "@/components/dashboard/user-identity";
