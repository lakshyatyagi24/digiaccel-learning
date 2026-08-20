import { apiClient } from "@/lib/api-client";
import type {
  ApiListMeta,
  Assignment,
  LearnerAssignmentDetail,
  LearningProgress,
} from "@/lib/types";

export async function listMyAssignments(
  params: { page?: number; limit?: number } = {},
) {
  const res = await apiClient.get("/learning/assignments", { params });
  return {
    items: res.data.data as Assignment[],
    meta: res.data.meta as ApiListMeta,
  };
}

export async function getMyAssignment(id: string) {
  const res = await apiClient.get(`/learning/assignments/${id}`);
  return res.data.data as LearnerAssignmentDetail;
}

export async function updateMyProgress(id: string, currentTimeSeconds: number) {
  const res = await apiClient.put(`/learning/assignments/${id}/progress`, {
    currentTimeSeconds,
  });
  return res.data.data as LearningProgress;
}

export interface SubmitResponseInput {
  questionId: string;
  optionId?: string;
  optionIds?: string[];
  text?: string;
}

export async function submitResponse(
  assignmentId: string,
  input: SubmitResponseInput,
) {
  const res = await apiClient.post(
    `/learning/assignments/${assignmentId}/responses`,
    input,
  );
  return res.data.data as { id: string; isCorrect: boolean | null };
}
