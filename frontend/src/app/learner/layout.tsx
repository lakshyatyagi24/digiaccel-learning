"use client";

import { GraduationCap } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/learner", label: "My Learning", icon: GraduationCap },
];

export default function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard role="LEARNER">
      <AppShell navItems={navItems}>{children}</AppShell>
    </RouteGuard>
  );
}
