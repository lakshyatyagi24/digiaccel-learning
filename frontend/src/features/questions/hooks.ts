"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { ApiError } from "@/lib/api-error";

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

export function useCreateQuestion(videoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.QuestionInput) =>
      api.createQuestion(videoId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos", videoId] });
      toast.success("Question added");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not add question")),
  });
}

export function useUpdateQuestion(videoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      input,
    }: {
      questionId: string;
      input: Partial<api.QuestionInput>;
    }) => api.updateQuestion(videoId, questionId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos", videoId] });
      toast.success("Question updated");
    },
    onError: (e: unknown) =>
      toast.error(errMsg(e, "Could not update question")),
  });
}

export function useDeleteQuestion(videoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => api.deleteQuestion(videoId, questionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos", videoId] });
      toast.success("Question removed");
    },
    onError: (e: unknown) =>
      toast.error(errMsg(e, "Could not remove question")),
  });
}
