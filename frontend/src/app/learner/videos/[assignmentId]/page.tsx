"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import {
  useMyAssignment,
  useSubmitResponse,
  useUpdateProgress,
} from "@/features/learning/hooks";
import {
  QuestionModal,
  type QuestionAnswer,
} from "@/features/learning/question-modal";
import { formatSeconds } from "@/lib/utils";

const PROGRESS_SAVE_INTERVAL_SECONDS = 5;

export default function LearnerVideoPage() {
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = params.assignmentId;
  const { data, isLoading, isError, error, refetch } =
    useMyAssignment(assignmentId);
  const updateProgress = useUpdateProgress(assignmentId);
  const submitResponse = useSubmitResponse(assignmentId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previousTimeRef = useRef(0);
  const lastSavedRef = useRef(0);
  const hasResumedRef = useRef(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const questions = useMemo(
    () =>
      [...(data?.video.questions ?? [])].sort(
        (a, b) => a.timestampSeconds - b.timestampSeconds,
      ),
    [data],
  );
  const activeQuestion =
    questions.find((q) => q.id === activeQuestionId) ?? null;

  // Resume from the last saved position once metadata is ready. If the learner
  // refreshed mid-question (paused exactly at an unanswered timestamp), re-open
  // that question immediately rather than silently resuming past it.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !data || hasResumedRef.current) return;

    const resume = () => {
      if (hasResumedRef.current) return;
      const resumeAt = data.progress.lastWatchedSeconds;
      if (resumeAt > 0) {
        el.currentTime = resumeAt;
        previousTimeRef.current = resumeAt;
        lastSavedRef.current = resumeAt;
      }
      hasResumedRef.current = true;

      const pendingQuestion = questions.find(
        (q) => !q.answered && q.timestampSeconds <= resumeAt,
      );
      if (pendingQuestion) {
        el.pause();
        setActiveQuestionId(pendingQuestion.id);
      }
    };

    if (el.readyState >= 1) {
      resume();
    } else {
      el.addEventListener("loadedmetadata", resume, { once: true });
      return () => el.removeEventListener("loadedmetadata", resume);
    }
  }, [data, questions]);

  const saveProgress = (currentTime: number) => {
    lastSavedRef.current = currentTime;
    updateProgress.mutate(Math.floor(currentTime));
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !data || activeQuestionId) return;

    const previous = previousTimeRef.current;
    const current = el.currentTime;

    // Crossing detection uses previous < timestamp <= current rather than an
    // exact equality check — timeupdate fires irregularly (~every 250ms), so
    // the playhead is very unlikely to land exactly on the target second.
    const crossed = questions.find(
      (q) =>
        !q.answered &&
        previous < q.timestampSeconds &&
        current >= q.timestampSeconds,
    );
    if (crossed) {
      el.pause();
      setActiveQuestionId(crossed.id);
      previousTimeRef.current = current;
      return;
    }

    previousTimeRef.current = current;

    if (current - lastSavedRef.current >= PROGRESS_SAVE_INTERVAL_SECONDS) {
      saveProgress(current);
    }
  };

  const handleSeeked = () => {
    const el = videoRef.current;
    if (!el || !data || activeQuestionId) return;

    // Manual scrubbing (native controls) can jump past several unanswered
    // questions at once — fire only the first one crossed by the seek.
    const current = el.currentTime;
    const crossed = questions.find(
      (q) =>
        !q.answered &&
        previousTimeRef.current < q.timestampSeconds &&
        current >= q.timestampSeconds,
    );
    if (crossed) {
      el.pause();
      setActiveQuestionId(crossed.id);
    }
    previousTimeRef.current = current;
  };

  const handlePause = () => {
    const el = videoRef.current;
    if (!el) return;
    if (Math.floor(el.currentTime) !== lastSavedRef.current) {
      saveProgress(el.currentTime);
    }
  };

  const handleEnded = () => {
    if (!data) return;
    saveProgress(data.video.durationSeconds);
    toast.success("Video completed");
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && videoRef.current) {
        saveProgress(videoRef.current.currentTime);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleQuestionSubmit = (answer: QuestionAnswer) => {
    if (!activeQuestion) return;
    submitResponse.mutate(
      { questionId: activeQuestion.id, ...answer },
      {
        onSuccess: () => {
          setActiveQuestionId(null);
          videoRef.current?.play();
        },
      },
    );
  };

  if (isLoading) return <LoadingState label="Loading video…" />;
  if (isError || !data)
    return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/learner"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to my learning
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {data.video.title}
        </h1>
        {data.video.description && (
          <p className="mt-1 text-sm text-slate-500">
            {data.video.description}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={data.video.videoUrl}
          controls
          className="aspect-video w-full"
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
          onPause={handlePause}
          onEnded={handleEnded}
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Progress</span>
          <span>{data.progress.completionPercentage}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${data.progress.completionPercentage}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {formatSeconds(data.progress.lastWatchedSeconds)} /{" "}
          {formatSeconds(data.video.durationSeconds)}
        </p>
      </div>

      {questions.length > 0 && (
        <div className="text-xs text-slate-400">
          {questions.filter((q) => q.answered).length}/{questions.length}{" "}
          questions answered
        </div>
      )}

      <QuestionModal
        key={activeQuestion?.id ?? "none"}
        question={activeQuestion}
        open={!!activeQuestion}
        submitting={submitResponse.isPending}
        onSubmit={handleQuestionSubmit}
      />
    </div>
  );
}
