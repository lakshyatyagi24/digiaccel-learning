import { apiClient } from "@/lib/api-client";
import type {
  ApiListMeta,
  ProgressReportRow,
  ProgressStatus,
} from "@/lib/types";

export interface ProgressReportParams {
  page?: number;
  limit?: number;
  learnerId?: string;
  videoId?: string;
  status?: ProgressStatus;
}

export async function fetchProgressReport(params: ProgressReportParams) {
  const res = await apiClient.get("/reports/progress", { params });
  return {
    items: res.data.data as ProgressReportRow[],
    meta: res.data.meta as ApiListMeta,
  };
}
