"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  useDeleteVideo,
  usePublishVideo,
  useUnpublishVideo,
  useVideos,
} from "@/features/videos/hooks";
import { formatSeconds } from "@/lib/utils";
import type { Video, VideoStatus } from "@/lib/types";

export default function AdminVideosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VideoStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);

  const { data, isLoading, isError, error, refetch } = useVideos({
    page,
    limit: 10,
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
  });
  const deleteVideo = useDeleteVideo();
  const publishVideo = usePublishVideo();
  const unpublishVideo = useUnpublishVideo();

  const totalPages = data
    ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit))
    : 1;
  const hasFilters = !!search || status !== "ALL";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Videos</h1>
          <p className="text-sm text-slate-500">
            Manage learning videos and their questions.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/videos/new">
            <Plus className="mr-1.5 h-4 w-4" /> Create video
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by title…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as VideoStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <LoadingState label="Loading videos…" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <EmptyState
          icon={VideoIcon}
          title={
            hasFilters
              ? "No videos match your filters"
              : "No videos created yet"
          }
          description={
            hasFilters
              ? "Try a different search or filter."
              : "Create your first video to get started."
          }
          actionLabel={hasFilters ? undefined : "Create your first video"}
          onAction={
            hasFilters ? undefined : () => router.push("/admin/videos/new")
          }
        />
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Questions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((video) => (
                  <tr key={video.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/admin/videos/${video.id}`}
                        className="hover:text-indigo-600 hover:underline"
                      >
                        {video.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatSeconds(video.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {video._count?.questions ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          video.status === "PUBLISHED" ? "success" : "neutral"
                        }
                      >
                        {video.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {video._count?.assignments ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {video.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={publishVideo.isPending}
                            onClick={() => publishVideo.mutate(video.id)}
                          >
                            Publish
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={unpublishVideo.isPending}
                            onClick={() => unpublishVideo.mutate(video.id)}
                          >
                            Unpublish
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/admin/videos/${video.id}`}>Edit</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(video)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                Page {data.meta.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete video?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.title}&rdquo;
              and its questions. Videos with learner assignments cannot be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={deleteVideo.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteVideo.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
