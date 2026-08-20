import { apiClient } from "@/lib/api-client";
import type { ApiListMeta, Role, User } from "@/lib/types";

export interface ListUsersParams {
  role?: Role;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listUsers(params: ListUsersParams) {
  const res = await apiClient.get("/users", { params });
  return { items: res.data.data as User[], meta: res.data.meta as ApiListMeta };
}
