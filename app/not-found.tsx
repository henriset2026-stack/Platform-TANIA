import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium tracking-widest text-slate-400 uppercase">
        404
      </p>
      <h1 className="mt-2 text-lg font-semibold text-[var(--color-telkom-navy)]">
        Halaman tidak ditemukan
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Sebagian besar halaman TANIA belum diimplementasikan. Dashboard sudah
        tersedia.
      </p>
      <Button
        render={<Link href="/dashboard">Buka dashboard</Link>}
        className="mt-6"
      />
    </main>
  );
}
