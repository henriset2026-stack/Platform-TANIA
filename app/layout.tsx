import type { Metadata } from "next";
import { connection } from "next/server";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "TANIA",
    template: "%s",
  },
  description:
    "Talent Intelligence, Analytics, Insight & Action — Chapter Digital Product & Solution, Telkom Indonesia",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Every page renders per request, so each receives the CSP nonce the
  // middleware generates (lib/security/csp.ts). A statically prerendered page
  // would carry no nonce and its scripts would be blocked.
  await connection();
  return (
    <html lang="id">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
