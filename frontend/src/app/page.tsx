"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingState } from "@/components/feedback/loading-state";

export default function RootPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !user) {
      router.replace("/login");
    } else {
      router.replace(user.role === "ADMIN" ? "/admin" : "/learner");
    }
  }, [hasHydrated, accessToken, user, router]);

  return <LoadingState label="Loading…" />;
}
