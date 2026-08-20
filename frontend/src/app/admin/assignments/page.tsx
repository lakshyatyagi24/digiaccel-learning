"use client";

import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useVideos } from "@/features/videos/hooks";
import { useUsers } from "@/features/users/hooks";
import {
  useAssignments,
  useCreateAssignment,
} from "@/features/assignments/hooks";

export default function AdminAssignmentsPage() {
  const [videoId, setVideoId] = useState<string>("");
  const [learnerId, setLearnerId] = useState<string>("");

  const publishedVideos = useVideos({
    status: "PUBLISHED",
    page: 1,
    limit: 100,
  });
  const learners = useUsers({ role: "LEARNER", page: 1, limit: 100 });
  const assignments = useAssignments({ page: 1, limit: 20 });
  const createAssignment = useCreateAssignment();

  const canSubmit = !!videoId && !!learnerId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Assignments</h1>
        <p className="text-sm text-slate-500">
          Assign published videos to learners and track who&rsquo;s watching
          what.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assign a video</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Video</Label>
              <Select value={videoId} onValueChange={setVideoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a published video" />
                </SelectTrigger>
                <SelectContent>
                  {publishedVideos.data?.items.length ? (
                    publishedVideos.data.items.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.title}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
                      No published videos
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Learner</Label>
              <Select value={learnerId} onValueChange={setLearnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a learner" />
                </SelectTrigger>
                <SelectContent>
                  {learners.data?.items.length ? (
                    learners.data.items.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
                      No learners found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!canSubmit}
                loading={createAssignment.isPending}
                onClick={() =>
                  createAssignment.mutate(
                    { videoId, learnerId },
                    {
                      onSuccess: () => {
                        setVideoId("");
                        setLearnerId("");
                      },
                    },
                  )
                }
              >
                <UserPlus className="mr-1.5 h-4 w-4" /> Assign
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {assignments.isLoading && <LoadingState label="Loading assignments…" />}
      {assignments.isError && (
        <ErrorState
          error={assignments.error}
          onRetry={() => assignments.refetch()}
        />
      )}
      {!assignments.isLoading &&
        !assignments.isError &&
        assignments.data?.items.length === 0 && (
          <EmptyState
            icon={Users}
            title="No assignments yet"
            description="Assign a published video to a learner above."
          />
        )}
      {!assignments.isLoading &&
        !assignments.isError &&
        !!assignments.data?.items.length && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Learner</th>
                    <th className="px-4 py-3">Video</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {a.learner.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.learner.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {a.video.title}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.progress?.completionPercentage ?? 0}%
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            a.progress?.status === "COMPLETED"
                              ? "success"
                              : a.progress?.status === "IN_PROGRESS"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {(a.progress?.status ?? "NOT_STARTED").replace(
                            "_",
                            " ",
                          )}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(a.assignedAt).toLocaleDateString()}
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
