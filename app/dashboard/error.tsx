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
        This view could not be loaded
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The request failed. Nothing was changed.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-slate-400">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset} className="mt-6">
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </Button>
    </div>
  );
}
