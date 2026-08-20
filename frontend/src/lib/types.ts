export type Role = "ADMIN" | "LEARNER";
export type VideoStatus = "DRAFT" | "PUBLISHED";
export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "SHORT_ANSWER";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface ApiListMeta {
  page: number;
  limit: number;
  total: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  order: number;
  isCorrect?: boolean; // present only in admin-facing responses
}

export interface Question {
  id: string;
  type: QuestionType;
  timestampSeconds: number;
  text: string;
  order: number;
  options: QuestionOption[];
}

export interface Video {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  videoUrl: string;
  durationSeconds: number;
  status: VideoStatus;
  createdById: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  questions?: Question[];
  _count?: { questions: number; assignments: number };
}

export interface Assignment {
  id: string;
  videoId: string;
  learnerId: string;
  assignedById: string;
  assignedAt: string;
  video: Pick<Video, "id" | "title" | "thumbnailUrl" | "durationSeconds"> &
    Partial<Video>;
  learner: Pick<User, "id" | "name" | "email">;
  progress: LearningProgress | null;
}

export interface LearningProgress {
  id: string;
  assignmentId: string;
  lastWatchedSeconds: number;
  maxWatchedSeconds: number;
  completionPercentage: number;
  status: ProgressStatus;
  lastPlayedAt: string | null;
  completedAt: string | null;
}

export interface QuizResponse {
  id: string;
  assignmentId: string;
  questionId: string;
  answer: { optionId?: string; optionIds?: string[]; text?: string };
  isCorrect: boolean | null;
  answeredAt: string;
}

export interface LearnerQuestion {
  id: string;
  type: QuestionType;
  timestampSeconds: number;
  text: string;
  order: number;
  options: { id: string; text: string; order: number }[];
  answered: boolean;
  response: {
    answer: QuizResponse["answer"];
    isCorrect: boolean | null;
  } | null;
}

export interface LearnerAssignmentDetail {
  id: string;
  video: {
    id: string;
    title: string;
    description: string | null;
    videoUrl: string;
    durationSeconds: number;
    questions: LearnerQuestion[];
  };
  progress: LearningProgress;
}

export interface ProgressReportRow {
  assignmentId: string;
  learner: Pick<User, "id" | "name" | "email">;
  video: { id: string; title: string; durationSeconds: number };
  completionPercentage: number;
  status: ProgressStatus;
  lastWatchedSeconds: number;
  completedAt: string | null;
  totalQuestions: number;
  responsesCount: number;
  accuracy: number | null;
}
