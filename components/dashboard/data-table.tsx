import { EmptyState, ErrorState, LoadingState } from "@/components/dashboard/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";

export interface Column<T> {
  /** Stable key, also used for the cell's React key. */
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => React.ReactNode;
  /** Right-align numeric columns. */
  readonly align?: "start" | "end";
  /** Hide below the `sm` breakpoint to keep mobile readable. */
  readonly hideOnMobile?: boolean | undefined;
  readonly width?: string | undefined;
}

/**
 * Table bound to the DataPoint contract.
 *
 * Takes a `DataPoint<readonly T[]>` rather than a plain array so a table
 * cannot silently render an empty body when the real situation is "not
 * connected", "not authorized" or "failed". Those are different facts and the
 * reader deserves to know which one applies.
 *
 * Accessibility: a real <caption> (visually hidden by default) names the
 * table, and `scope="col"` is set on headers so screen readers can associate
 * cells with columns.
 */
export function DataTable<T>({
  caption,
  captionVisible = false,
  columns,
  data,
  getRowId,
  emptyTitle = "Belum ada data",
  emptyDescription,
  className,
}: {
  caption: string;
  captionVisible?: boolean | undefined;
  columns: readonly Column<T>[];
  data: DataPoint<readonly T[]>;
  getRowId: (row: T, index: number) => string;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  className?: string | undefined;
}) {
  if (data.state === "failed") {
    return <ErrorState detail={data.reason} />;
  }
  if (data.state === "restricted") {
    return (
      <EmptyState
        title="Tidak berwenang"
        description={data.reason}
      />
    );
  }
  if (data.state === "not-integrated") {
    return (
      <EmptyState
        title={`${data.system} belum terintegrasi`}
        description={`${data.system} mengelola ${data.owns}.`}
      />
    );
  }
  if (data.state === "not-connected") {
    return (
      <EmptyState
        title="Belum ada sumber data"
        description={`Fase ${data.requiredPhase} — memerlukan ${data.requires}`}
      />
    );
  }
  if (!isLive(data)) {
    return <LoadingState label={`Memuat ${caption}`} />;
  }

  if (data.value.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        {...(emptyDescription ? { description: emptyDescription } : {})}
      />
    );
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <Table>
        <caption className={captionVisible ? "mb-2 text-sm text-slate-600" : "sr-only"}>
          {caption}
        </caption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  column.align === "end" && "text-right",
                  column.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.value.map((row, index) => (
            <TableRow key={getRowId(row, index)}>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    column.align === "end" && "text-right tabular-nums",
                    column.hideOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
