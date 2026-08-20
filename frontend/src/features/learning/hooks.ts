"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { ApiError } from "@/lib/api-error";

export function useMyAssignments(
  params: { page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: ["my-assignments", params],
    queryFn: () => api.listMyAssignments(params),
  });
}

export function useMyAssignment(id: string) {
  return useQuery({
    queryKey: ["my-assignment", id],
    queryFn: () => api.getMyAssignment(id),
    enabled: !!id,
  });
}

export function useUpdateProgress(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currentTimeSeconds: number) =>
      api.updateMyProgress(assignmentId, currentTimeSeconds),
    onSuccess: (progress) => {
      qc.setQueryData(
        ["my-assignment", assignmentId],
        (old: Awaited<ReturnType<typeof api.getMyAssignment>> | undefined) =>
          old ? { ...old, progress } : old,
      );
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
  });
}

export function useSubmitResponse(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.SubmitResponseInput) =>
      api.submitResponse(assignmentId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-assignment", assignmentId] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not submit answer",
      ),
  });
}
