"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loginRequest } from "./api";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-error";

export function useLogin() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginRequest(email, password),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      router.replace(data.user.role === "ADMIN" ? "/admin" : "/learner");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    },
  });
}
