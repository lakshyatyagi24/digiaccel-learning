"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AppShell({
  navItems,
  children,
}: {
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="flex h-14 items-center px-5 text-sm font-semibold text-slate-900">
          Digiaccel Learning
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-slate-900">
              {user?.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <header className="flex flex-col border-b border-slate-200 bg-white md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-semibold text-slate-900">
            Digiaccel Learning
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2"
          aria-label="Primary"
        >
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
