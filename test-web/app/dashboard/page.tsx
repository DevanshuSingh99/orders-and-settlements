"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { SuitesTab } from "@/components/dashboard/SuitesTab";
import { LoadTab } from "@/components/dashboard/LoadTab";

type TabId = "suites" | "load";

function DashboardContent() {
  const [tab, setTab] = useState<TabId>("suites");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Suites prove business rules against the live API. Load runs server-side with hard caps for small VMs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "suites" ? "primary" : "outline"}
            onPress={() => setTab("suites")}
          >
            Suites
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "load" ? "primary" : "outline"}
            onPress={() => setTab("load")}
          >
            Load
          </Button>
        </div>
      </div>

      {/* Keep both mounted so switching tabs does not wipe form/run state. */}
      <div className={tab === "suites" ? "block" : "hidden"} aria-hidden={tab !== "suites"}>
        <SuitesTab />
      </div>
      <div className={tab === "load" ? "block" : "hidden"} aria-hidden={tab !== "load"}>
        <LoadTab />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
