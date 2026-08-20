import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError } from "./api-error";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/login"
        ) {
          window.location.href = "/login";
        }
      }

      const body = error.response?.data as
        | { error?: { code: string; message: string; details?: unknown } }
        | undefined;
      if (body?.error) {
        return Promise.reject(
          new ApiError(
            body.error.code,
            body.error.message,
            error.response?.status,
            body.error.details,
          ),
        );
      }
      return Promise.reject(
        new ApiError(
          "NETWORK_ERROR",
          "Could not reach the server. Please try again.",
          error.response?.status,
        ),
      );
    }
    return Promise.reject(error);
  },
);
