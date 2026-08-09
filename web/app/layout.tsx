import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";

export const metadata: Metadata = {
  title: "Orders & Settlements",
  description: "Track orders, payments, and amounts due.",
};

// HeroUI v3 needs no provider component (unlike v2/NextUI). AuthProvider is
// our own context for the current user and access token - see lib/auth/AuthContext.tsx.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
