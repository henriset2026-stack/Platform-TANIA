"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route error boundary.
 *
 * Shows an explicit failure. CLAUDE.md §22 forbids leaking stack traces or SQL
 * internals to clients, so only the framework-provided digest is surfaced —
 * enough to correlate with server logs, and nothing more.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard route error", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <CircleAlert
        aria-hidden="true"
        className="mx-auto size-8 text-[var(--color-telkom-red)]"
      />
      <h1 className="mt-4 text-lg font-semibold text-[var(--color-telkom-navy)]">
        Tampilan ini tidak dapat dimuat
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Permintaan gagal. Tidak ada yang diubah.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-slate-400">
          Referensi: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset} className="mt-6">
        <RefreshCw aria-hidden="true" className="size-4" />
        Coba lagi
      </Button>
    </div>
  );
}
