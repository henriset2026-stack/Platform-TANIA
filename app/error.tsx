"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("application error", { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <CircleAlert
        aria-hidden="true"
        className="size-8 text-[var(--color-telkom-red)]"
      />
      <h1 className="mt-4 text-lg font-semibold text-[var(--color-telkom-navy)]">
        Terjadi kesalahan
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
    </main>
  );
}
