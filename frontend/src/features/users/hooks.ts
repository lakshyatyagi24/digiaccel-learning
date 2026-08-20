"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

export function useUsers(params: api.ListUsersParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => api.listUsers(params),
  });
}
