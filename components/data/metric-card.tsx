import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataStateNotice } from "@/components/data/data-state";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";

/**
 * A dashboard metric.
 *
 * The card can only display a number when the DataPoint is `live`, which by
 * construction carries provenance. Any other state renders DataStateNotice
 * instead, so the shell can be laid out without inventing values.
 */
export function MetricCard({
  label,
  description,
  point,
  format = (v) => String(v),
}: {
  label: string;
  description?: string;
  point: DataPoint<number>;
  format?: (value: number) => string;
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLive(point) ? (
          <>
            <p className="text-3xl font-semibold tabular-nums text-[var(--color-telkom-navy)]">
              {format(point.value)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {point.provenance.source} · as of{" "}
              {new Date(point.provenance.asOf).toISOString().slice(0, 10)}
              {point.provenance.validated ? " · validated" : " · unvalidated"}
            </p>
          </>
        ) : (
          <DataStateNotice point={point} />
        )}
        {description ? (
          <p className="mt-3 text-xs text-slate-500">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
