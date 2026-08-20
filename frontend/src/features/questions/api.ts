import { apiClient } from "@/lib/api-client";
import type { Question, QuestionType } from "@/lib/types";

export interface QuestionOptionInput {
  text: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  type: QuestionType;
  timestampSeconds: number;
  text: string;
  order: number;
  options?: QuestionOptionInput[];
}

export async function createQuestion(videoId: string, input: QuestionInput) {
  const res = await apiClient.post(`/videos/${videoId}/questions`, input);
  return res.data.data as Question;
}

export async function updateQuestion(
  videoId: string,
  questionId: string,
  input: Partial<QuestionInput>,
) {
  const res = await apiClient.patch(
    `/videos/${videoId}/questions/${questionId}`,
    input,
  );
  return res.data.data as Question;
}

export async function deleteQuestion(videoId: string, questionId: string) {
  await apiClient.delete(`/videos/${videoId}/questions/${questionId}`);
}
