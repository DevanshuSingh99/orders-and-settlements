import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";

export const metadata: Metadata = {
  title: "Test Runner · Orders & Settlements",
  description: "Password-gated dashboard for running API test suites and load tests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
