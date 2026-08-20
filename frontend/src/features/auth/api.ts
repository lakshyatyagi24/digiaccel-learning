import { apiClient } from "@/lib/api-client";
import type { AuthUser } from "@/stores/auth-store";

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await apiClient.post("/auth/login", { email, password });
  return res.data.data;
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await apiClient.get("/auth/me");
  return res.data.data;
}
