"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getTestApiBaseUrl } from "@/lib/api/client";

export function AppHeader() {
  const { logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-zinc-900">
            Test Runner
          </Link>
          <span className="truncate text-xs text-zinc-500">{getTestApiBaseUrl()}</span>
        </div>
        <Button variant="ghost" size="sm" onPress={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
