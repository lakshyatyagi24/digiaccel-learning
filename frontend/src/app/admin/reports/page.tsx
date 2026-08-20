"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { useProgressReport } from "@/features/reports/hooks";
import { useVideos } from "@/features/videos/hooks";
import { useUsers } from "@/features/users/hooks";
import type { ProgressStatus } from "@/lib/types";

export default function AdminReportsPage() {
  const [videoId, setVideoId] = useState<string>("ALL");
  const [learnerId, setLearnerId] = useState<string>("ALL");
  const [status, setStatus] = useState<ProgressStatus | "ALL">("ALL");

  const videos = useVideos({ page: 1, limit: 100 });
  const learners = useUsers({ role: "LEARNER", page: 1, limit: 100 });
  const report = useProgressReport({
    page: 1,
    limit: 50,
    videoId: videoId === "ALL" ? undefined : videoId,
    learnerId: learnerId === "ALL" ? undefined : learnerId,
    status: status === "ALL" ? undefined : status,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Learner progress and quiz responses across all assignments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select value={videoId} onValueChange={setVideoId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All videos</SelectItem>
            {videos.data?.items.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={learnerId} onValueChange={setLearnerId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All learners</SelectItem>
            {learners.data?.items.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ProgressStatus | "ALL")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="NOT_STARTED">Not started</SelectItem>
            <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {report.isLoading && <LoadingState label="Loading report…" />}
      {report.isError && (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      )}
      {!report.isLoading &&
        !report.isError &&
        report.data?.items.length === 0 && (
          <EmptyState
            icon={BarChart3}
            title="No data yet"
            description="Once learners start watching assigned videos, their progress shows up here."
          />
        )}
      {!report.isLoading && !report.isError && !!report.data?.items.length && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Learner</th>
                  <th className="px-4 py-3">Video</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Responses</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.data.items.map((row) => (
                  <tr key={row.assignmentId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {row.learner.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.learner.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.video.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.completionPercentage}%
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          row.status === "COMPLETED"
                            ? "success"
                            : row.status === "IN_PROGRESS"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.responsesCount}/{row.totalQuestions}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.accuracy === null ? "—" : `${row.accuracy}%`}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.completedAt
                        ? new Date(row.completedAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
