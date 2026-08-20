"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Users, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useVideos } from "@/features/videos/hooks";
import { useAssignments } from "@/features/assignments/hooks";
import { useProgressReport } from "@/features/reports/hooks";

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {loading ? <Spinner className="h-5 w-5" /> : value}
          </p>
        </div>
        <div className="rounded-full bg-indigo-50 p-3">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const allVideos = useVideos({ page: 1, limit: 1 });
  const publishedVideos = useVideos({ status: "PUBLISHED", page: 1, limit: 1 });
  const assignments = useAssignments({ page: 1, limit: 1 });
  const completed = useProgressReport({
    status: "COMPLETED",
    page: 1,
    limit: 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Overview of your learning content and learners.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total videos"
          value={allVideos.data?.meta.total ?? 0}
          loading={allVideos.isLoading}
          icon={Video}
        />
        <StatCard
          label="Published videos"
          value={publishedVideos.data?.meta.total ?? 0}
          loading={publishedVideos.isLoading}
          icon={Video}
        />
        <StatCard
          label="Assignments"
          value={assignments.data?.meta.total ?? 0}
          loading={assignments.isLoading}
          icon={Users}
        />
        <StatCard
          label="Completed"
          value={completed.data?.meta.total ?? 0}
          loading={completed.isLoading}
          icon={CheckCircle2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>
            1.{" "}
            <Link
              href="/admin/videos/new"
              className="text-indigo-600 hover:underline"
            >
              Create a video
            </Link>{" "}
            with timestamp questions.
          </p>
          <p>
            2. Publish it, then{" "}
            <Link
              href="/admin/assignments"
              className="text-indigo-600 hover:underline"
            >
              assign it to a learner
            </Link>
            .
          </p>
          <p>
            3. Track progress and responses in{" "}
            <Link
              href="/admin/reports"
              className="text-indigo-600 hover:underline"
            >
              Reports
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
