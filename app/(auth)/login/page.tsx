import type { Metadata } from "next";

import { TaniaWordmark } from "@/components/brand/tania-wordmark";
import { Button } from "@/components/ui/button";

import { signInWithEntra } from "./actions";

export const metadata: Metadata = { title: "Sign in · TANIA" };

const ERRORS: Record<string, string> = {
  auth_failed: "Sign-in could not be completed. Please try again.",
  missing_code: "The sign-in link was incomplete. Please try again.",
  unauthenticated: "Please sign in to continue.",
};

/**
 * S01 — Login (TANIA_PRD_v2.0.md §25).
 *
 * Enterprise SSO only: there is no password form, because identity is owned
 * by Microsoft Entra ID. The button is disabled until the provider is
 * configured — an enabled control that cannot work would be a worse lie than
 * an honest disabled one.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <TaniaWordmark showTagline className="[&>span:first-child]:text-3xl" />
      <p className="mt-3 text-sm text-slate-600">
        Talent Intelligence, Analytics, Insight &amp; Action
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {ERRORS[error] ?? "Sign-in failed. Please try again."}
        </p>
      ) : null}

      <div className="mt-8">
        <form action={signInWithEntra}>
          {/* Validated again server-side; only same-origin paths survive. */}
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <Button type="submit" className="w-full" disabled={!configured}>
            Sign in with Microsoft Entra ID
          </Button>
        </form>
        {!configured ? (
          <p className="mt-3 text-xs text-slate-500">
            Single sign-on is not configured in this environment. Set the
            Supabase and Entra variables in <code>.env.local</code> — see{" "}
            <code>.env.example</code>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
