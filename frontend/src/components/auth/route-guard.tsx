"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingState } from "@/components/feedback/loading-state";

export function RouteGuard({
  role,
  children,
}: {
  role: "ADMIN" | "LEARNER";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !user) {
      router.replace("/login");
      return;
    }
    if (user.role !== role) {
      router.replace(user.role === "ADMIN" ? "/admin" : "/learner");
    }
  }, [hasHydrated, accessToken, user, role, router]);

  if (!hasHydrated || !accessToken || !user || user.role !== role) {
    return <LoadingState label="Checking your session…" />;
  }

  return <>{children}</>;
}
