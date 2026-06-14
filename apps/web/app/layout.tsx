import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "r402 Sentinel | Proof-Bound Agent Firewall",
  description: "Bounded permissions, protected payments, undeniable proofs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
