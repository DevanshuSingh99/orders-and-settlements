"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { LoadingState } from "@/components/ui/PageState";

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [status, router]);

  return <LoadingState />;
}
