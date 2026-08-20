"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { ApiError } from "@/lib/api-error";

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

export function useVideos(params: api.ListVideosParams) {
  return useQuery({
    queryKey: ["videos", params],
    queryFn: () => api.listVideos(params),
  });
}

export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: ["videos", id],
    queryFn: () => api.getVideo(id as string),
    enabled: !!id,
  });
}

export function useCreateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createVideo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video created");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not create video")),
  });
}

export function useUpdateVideo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<api.VideoInput>) => api.updateVideo(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video updated");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not update video")),
  });
}

export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteVideo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video deleted");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not delete video")),
  });
}

export function usePublishVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.publishVideo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video published");
    },
    onError: (e: unknown) => toast.error(errMsg(e, "Could not publish video")),
  });
}

export function useUnpublishVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.unpublishVideo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video moved to draft");
    },
    onError: (e: unknown) =>
      toast.error(errMsg(e, "Could not unpublish video")),
  });
}
