"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePublishVideo,
  useUnpublishVideo,
  useUpdateVideo,
  useVideo,
} from "@/features/videos/hooks";
import {
  useCreateQuestion,
  useDeleteQuestion,
  useUpdateQuestion,
} from "@/features/questions/hooks";
import { VideoForm } from "@/features/videos/video-form";
import {
  QuestionForm,
  type QuestionFormValues,
} from "@/features/questions/question-form";
import { formatSeconds } from "@/lib/utils";
import type { Question } from "@/lib/types";

type QuestionDialogState =
  { mode: "create" } | { mode: "edit"; question: Question } | null;

export default function EditVideoPage() {
  const params = useParams<{ id: string }>();
  const videoId = params.id;
  const { data: video, isLoading, isError, error, refetch } = useVideo(videoId);
  const updateVideo = useUpdateVideo(videoId);
  const publishVideo = usePublishVideo();
  const unpublishVideo = useUnpublishVideo();
  const createQuestion = useCreateQuestion(videoId);
  const updateQuestion = useUpdateQuestion(videoId);
  const deleteQuestion = useDeleteQuestion(videoId);

  const [questionDialog, setQuestionDialog] =
    useState<QuestionDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  if (isLoading) return <LoadingState label="Loading video…" />;
  if (isError || !video)
    return <ErrorState error={error} onRetry={() => refetch()} />;

  const sortedQuestions = [...(video.questions ?? [])].sort(
    (a, b) => a.timestampSeconds - b.timestampSeconds,
  );

  const handleQuestionSubmit = (values: QuestionFormValues) => {
    const order =
      questionDialog?.mode === "edit"
        ? questionDialog.question.order
        : sortedQuestions.length;
    const payload = { ...values, order };
    if (questionDialog?.mode === "edit") {
      updateQuestion.mutate(
        { questionId: questionDialog.question.id, input: payload },
        { onSuccess: () => setQuestionDialog(null) },
      );
    } else {
      createQuestion.mutate(payload, {
        onSuccess: () => setQuestionDialog(null),
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {video.title}
            </h1>
            <Badge
              variant={video.status === "PUBLISHED" ? "success" : "neutral"}
            >
              {video.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            {formatSeconds(video.durationSeconds)} · {sortedQuestions.length}{" "}
            question
            {sortedQuestions.length === 1 ? "" : "s"}
          </p>
        </div>
        {video.status === "DRAFT" ? (
          <Button
            loading={publishVideo.isPending}
            onClick={() => publishVideo.mutate(video.id)}
          >
            Publish
          </Button>
        ) : (
          <Button
            variant="outline"
            loading={unpublishVideo.isPending}
            onClick={() => unpublishVideo.mutate(video.id)}
          >
            Move to draft
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoForm
            defaultValues={{
              title: video.title,
              description: video.description ?? "",
              thumbnailUrl: video.thumbnailUrl ?? "",
              videoUrl: video.videoUrl,
              durationSeconds: video.durationSeconds,
            }}
            submitting={updateVideo.isPending}
            onSubmit={(values) =>
              updateVideo.mutate({
                ...values,
                description: values.description || undefined,
                thumbnailUrl: values.thumbnailUrl || undefined,
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Questions</CardTitle>
          <Button
            size="sm"
            onClick={() => setQuestionDialog({ mode: "create" })}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add question
          </Button>
        </CardHeader>
        <CardContent>
          {sortedQuestions.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No questions yet"
              description="Add timestamp questions that appear while the learner watches."
            />
          ) : (
            <ul className="space-y-3">
              {sortedQuestions.map((q) => (
                <li
                  key={q.id}
                  className="rounded-md border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono">
                          {formatSeconds(q.timestampSeconds)}
                        </span>
                        <Badge variant="neutral">
                          {q.type.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {q.text}
                      </p>
                      {q.options.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                          {q.options.map((o) => (
                            <li
                              key={o.id}
                              className={
                                o.isCorrect
                                  ? "font-medium text-emerald-700"
                                  : ""
                              }
                            >
                              {o.isCorrect ? "✓ " : "· "}
                              {o.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setQuestionDialog({ mode: "edit", question: q })
                        }
                        aria-label="Edit question"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(q)}
                        aria-label="Delete question"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!questionDialog}
        onOpenChange={(open) => !open && setQuestionDialog(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {questionDialog?.mode === "edit"
                ? "Edit question"
                : "Add question"}
            </DialogTitle>
            <DialogDescription>
              Questions pause the video and prompt the learner at the given
              timestamp.
            </DialogDescription>
          </DialogHeader>
          <QuestionForm
            videoDurationSeconds={video.durationSeconds}
            initialValues={
              questionDialog?.mode === "edit"
                ? questionDialog.question
                : undefined
            }
            submitting={createQuestion.isPending || updateQuestion.isPending}
            onSubmit={handleQuestionSubmit}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete question?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Questions that already have learner
              responses cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={deleteQuestion.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteQuestion.mutate(deleteTarget.id, {
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
