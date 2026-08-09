"use client";

/**
 * Wraps every protected page. Redirects to /login if there is no session.
 * This is a UX convenience only - the real authorization boundary is the
 * API itself, which independently rejects unauthenticated requests
 * regardless of what the frontend does (see docs/implementation-plan.md
 * section 18: "hiding a button is not security").
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppHeader } from "./AppHeader";
import { ErrorState, LoadingState } from "@/components/ui/PageState";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status, sessionError, retrySession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <LoadingState label="Loading your account..." />;
  }

  if (status === "unavailable") {
    return (
      <div className="min-h-screen bg-[var(--background)] px-6 py-16">
        <ErrorState
          message={sessionError?.message ?? "Unable to verify your session right now."}
          hint={sessionError?.hint}
          onRetry={retrySession}
        />
      </div>
    );
  }

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
