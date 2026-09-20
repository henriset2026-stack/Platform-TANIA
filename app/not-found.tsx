import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium tracking-widest text-slate-400 uppercase">
        404
      </p>
      <h1 className="mt-2 text-lg font-semibold text-[var(--color-telkom-navy)]">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Most TANIA destinations are not implemented yet. The dashboard shell is
        available.
      </p>
      <Button
        render={<Link href="/dashboard">Go to dashboard</Link>}
        className="mt-6"
      />
    </main>
  );
}
