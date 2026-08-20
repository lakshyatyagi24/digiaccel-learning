"use client";

import { BarChart3, LayoutDashboard, UserPlus, Video } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/videos", label: "Videos", icon: Video },
  { href: "/admin/assignments", label: "Assignments", icon: UserPlus },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard role="ADMIN">
      <AppShell navItems={navItems}>{children}</AppShell>
    </RouteGuard>
  );
}
