import { ProgressStatus } from '@prisma/client';

/**
 * Completion is driven by the furthest point ever reached (maxWatchedSeconds),
 * not the current playhead — rewinding to review earlier content must never
 * cause completion to regress. Percentage is clamped to [0, 100] because a
 * client-reported timestamp can exceed the known duration (bad metadata,
 * float rounding at the very end of playback).
 */
export function calculateCompletionPercentage(
  maxWatchedSeconds: number,
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) {
    return 0;
  }
  const raw = Math.round((maxWatchedSeconds / durationSeconds) * 100);
  return Math.min(100, Math.max(0, raw));
}

export function deriveProgressStatus(
  completionPercentage: number,
): ProgressStatus {
  if (completionPercentage >= 100) {
    return ProgressStatus.COMPLETED;
  }
  if (completionPercentage > 0) {
    return ProgressStatus.IN_PROGRESS;
  }
  return ProgressStatus.NOT_STARTED;
}
