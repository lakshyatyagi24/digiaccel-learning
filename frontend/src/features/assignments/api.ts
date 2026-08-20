import { apiClient } from "@/lib/api-client";
import type { ApiListMeta, Assignment } from "@/lib/types";

export interface ListAssignmentsParams {
  page?: number;
  limit?: number;
  videoId?: string;
  learnerId?: string;
}

export async function listAssignments(params: ListAssignmentsParams) {
  const res = await apiClient.get("/assignments", { params });
  return {
    items: res.data.data as Assignment[],
    meta: res.data.meta as ApiListMeta,
  };
}

export async function createAssignment(input: {
  videoId: string;
  learnerId: string;
}) {
  const res = await apiClient.post("/assignments", input);
  return res.data.data as Assignment;
}
