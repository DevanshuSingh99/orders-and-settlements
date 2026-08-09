"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppHeader } from "./AppHeader";

/** Redirects to /login when there is no in-memory runner JWT. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
