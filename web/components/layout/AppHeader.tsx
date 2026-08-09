"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useAuth } from "@/lib/auth/AuthContext";

/** Minimal top bar: brand, current user's email, and a logout button. No navigation clutter - this is a two-screen app. */
export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-zinc-900">
          Orders &amp; Settlements
        </Link>
        <div className="flex items-center gap-4">
          {user ? <span className="text-sm text-zinc-500">{user.email}</span> : null}
          <Button variant="ghost" size="sm" onPress={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
