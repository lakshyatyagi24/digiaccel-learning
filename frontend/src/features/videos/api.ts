import { apiClient } from "@/lib/api-client";
import type { ApiListMeta, Video, VideoStatus } from "@/lib/types";

export interface ListVideosParams {
  page?: number;
  limit?: number;
  status?: VideoStatus;
  search?: string;
}

export async function listVideos(params: ListVideosParams) {
  const res = await apiClient.get("/videos", { params });
  return {
    items: res.data.data as Video[],
    meta: res.data.meta as ApiListMeta,
  };
}

export async function getVideo(id: string) {
  const res = await apiClient.get(`/videos/${id}`);
  return res.data.data as Video;
}

export interface VideoInput {
  title: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  durationSeconds: number;
}

export async function createVideo(input: VideoInput) {
  const res = await apiClient.post("/videos", input);
  return res.data.data as Video;
}

export async function updateVideo(id: string, input: Partial<VideoInput>) {
  const res = await apiClient.patch(`/videos/${id}`, input);
  return res.data.data as Video;
}

export async function deleteVideo(id: string) {
  await apiClient.delete(`/videos/${id}`);
}

export async function publishVideo(id: string) {
  const res = await apiClient.post(`/videos/${id}/publish`);
  return res.data.data as Video;
}

export async function unpublishVideo(id: string) {
  const res = await apiClient.post(`/videos/${id}/unpublish`);
  return res.data.data as Video;
}
