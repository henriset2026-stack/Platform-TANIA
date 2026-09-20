import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TANIA",
  description:
    "Talent Intelligence, Analytics, Insight & Action — Chapter DPS, Telkom Indonesia",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
