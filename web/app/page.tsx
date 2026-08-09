"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { ErrorState, LoadingState } from "@/components/ui/PageState";

/** Root route just redirects to the dashboard (or login) once we know whether the user has a session. */
export default function Home() {
  const { status, sessionError, retrySession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "unavailable") {
    return (
      <div className="min-h-screen px-6 py-16">
        <ErrorState
          message={sessionError?.message ?? "Unable to verify your session right now."}
          hint={sessionError?.hint}
          onRetry={retrySession}
        />
      </div>
    );
  }

  return <LoadingState />;
}
