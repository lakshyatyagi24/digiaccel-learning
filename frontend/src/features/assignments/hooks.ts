"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { ApiError } from "@/lib/api-error";

export function useAssignments(params: api.ListAssignmentsParams) {
  return useQuery({
    queryKey: ["assignments", params],
    queryFn: () => api.listAssignments(params),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createAssignment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video assigned to learner");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Could not assign video"),
  });
}
