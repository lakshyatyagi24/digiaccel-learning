"use client";

import Link from "next/link";
import { GraduationCap, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { useMyAssignments } from "@/features/learning/hooks";
import { formatSeconds } from "@/lib/utils";

export default function LearnerDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useMyAssignments({
    page: 1,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My Learning</h1>
        <p className="text-sm text-slate-500">Videos assigned to you.</p>
      </div>

      {isLoading && <LoadingState label="Loading your videos…" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {!isLoading && !isError && data?.items.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title="No videos assigned yet"
          description="Your admin hasn't assigned any videos to you yet. Check back soon."
        />
      )}

      {!isLoading && !isError && !!data?.items.length && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((a) => {
            const status = a.progress?.status ?? "NOT_STARTED";
            const pct = a.progress?.completionPercentage ?? 0;
            return (
              <Card key={a.id} className="flex flex-col overflow-hidden">
                <div className="aspect-video bg-slate-100">
                  {a.video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized thumbnail URLs entered by admins
                    <img
                      src={a.video.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <GraduationCap className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="font-medium text-slate-900">
                      {a.video.title}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {formatSeconds(a.video.durationSeconds)}
                    </p>
                  </div>
                  <div className="mt-auto space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <Badge
                        variant={
                          status === "COMPLETED"
                            ? "success"
                            : status === "IN_PROGRESS"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {status.replace("_", " ")}
                      </Badge>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <Button asChild className="w-full">
                      <Link href={`/learner/videos/${a.id}`}>
                        <PlayCircle className="mr-1.5 h-4 w-4" />
                        {status === "NOT_STARTED"
                          ? "Start"
                          : status === "COMPLETED"
                            ? "Watch again"
                            : "Continue"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
