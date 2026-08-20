import { ProgressStatus } from '@prisma/client';
import {
  calculateCompletionPercentage,
  deriveProgressStatus,
} from './progress-calculator';

describe('calculateCompletionPercentage', () => {
  it('returns 0 for a video with zero/invalid duration (no divide-by-zero)', () => {
    expect(calculateCompletionPercentage(50, 0)).toBe(0);
  });

  it('returns 0 when nothing has been watched', () => {
    expect(calculateCompletionPercentage(0, 300)).toBe(0);
  });

  it('returns the rounded percentage watched', () => {
    expect(calculateCompletionPercentage(150, 300)).toBe(50);
  });

  it('returns 100 when watched equals duration', () => {
    expect(calculateCompletionPercentage(300, 300)).toBe(100);
  });

  it('clamps to 100 when watched exceeds duration (bad client timestamp)', () => {
    expect(calculateCompletionPercentage(400, 300)).toBe(100);
  });

  it('reflects the furthest point reached, not the current rewind position', () => {
    // learner reached 320s then rewound to 120s — caller passes maxWatchedSeconds (320), not currentTime
    expect(calculateCompletionPercentage(320, 400)).toBe(80);
  });
});

describe('deriveProgressStatus', () => {
  it('is NOT_STARTED at 0%', () => {
    expect(deriveProgressStatus(0)).toBe(ProgressStatus.NOT_STARTED);
  });

  it('is IN_PROGRESS strictly between 0 and 100', () => {
    expect(deriveProgressStatus(1)).toBe(ProgressStatus.IN_PROGRESS);
    expect(deriveProgressStatus(99)).toBe(ProgressStatus.IN_PROGRESS);
  });

  it('is COMPLETED at 100%', () => {
    expect(deriveProgressStatus(100)).toBe(ProgressStatus.COMPLETED);
  });
});
