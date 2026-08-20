"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

export function useProgressReport(params: api.ProgressReportParams) {
  return useQuery({
    queryKey: ["reports", "progress", params],
    queryFn: () => api.fetchProgressReport(params),
  });
}
