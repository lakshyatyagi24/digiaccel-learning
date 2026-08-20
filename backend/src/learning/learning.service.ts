import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProgressStatus, QuestionType } from '@prisma/client';
import { LearningRepository } from './learning.repository';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import {
  calculateCompletionPercentage,
  deriveProgressStatus,
} from './progress-calculator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  AppException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../common/exceptions/app.exception';

type OwnedAssignment = NonNullable<
  Awaited<ReturnType<LearningRepository['findAssignmentById']>>
>;
type OwnedQuestion = OwnedAssignment['video']['questions'][number];

@Injectable()
export class LearningService {
  constructor(private readonly learningRepository: LearningRepository) {}

  async listMyAssignments(learnerId: string, page: number, limit: number) {
    const { items, total } =
      await this.learningRepository.findAssignmentsForLearner(
        learnerId,
        page,
        limit,
      );
    return { items, meta: { page, limit, total } };
  }

  async getAssignment(assignmentId: string, user: AuthenticatedUser) {
    const assignment = await this.getOwnedAssignment(assignmentId, user);
    const responses =
      await this.learningRepository.findResponsesForAssignment(assignmentId);
    const responseByQuestionId = new Map(
      responses.map((r) => [r.questionId, r]),
    );

    return {
      id: assignment.id,
      video: {
        id: assignment.video.id,
        title: assignment.video.title,
        description: assignment.video.description,
        videoUrl: assignment.video.videoUrl,
        durationSeconds: assignment.video.durationSeconds,
        questions: assignment.video.questions.map((q) => {
          const response = responseByQuestionId.get(q.id);
          return {
            id: q.id,
            type: q.type,
            timestampSeconds: q.timestampSeconds,
            text: q.text,
            order: q.order,
            // isCorrect deliberately stripped — never reveal answers before submission
            options: q.options.map((o) => ({
              id: o.id,
              text: o.text,
              order: o.order,
            })),
            answered: !!response,
            response: response
              ? { answer: response.answer, isCorrect: response.isCorrect }
              : null,
          };
        }),
      },
      progress: assignment.progress,
    };
  }

  async getProgress(assignmentId: string, user: AuthenticatedUser) {
    const assignment = await this.getOwnedAssignment(assignmentId, user);
    return assignment.progress;
  }

  async updateProgress(
    assignmentId: string,
    dto: UpdateProgressDto,
    user: AuthenticatedUser,
  ) {
    const assignment = await this.getOwnedAssignment(assignmentId, user);
    const duration = assignment.video.durationSeconds;

    if (dto.currentTimeSeconds > duration) {
      throw new AppException(
        'INVALID_PROGRESS',
        'currentTimeSeconds cannot exceed video duration',
        HttpStatus.BAD_REQUEST,
      );
    }

    const progress = assignment.progress;
    if (!progress) {
      throw new NotFoundException(
        'PROGRESS_NOT_FOUND',
        'Progress record not found',
      );
    }

    const maxWatchedSeconds = Math.max(
      progress.maxWatchedSeconds,
      dto.currentTimeSeconds,
    );
    const completionPercentage = calculateCompletionPercentage(
      maxWatchedSeconds,
      duration,
    );
    const status = deriveProgressStatus(completionPercentage);
    const wasCompleted = progress.status === ProgressStatus.COMPLETED;
    const now = new Date();

    return this.learningRepository.updateProgress(assignmentId, {
      lastWatchedSeconds: dto.currentTimeSeconds,
      maxWatchedSeconds,
      completionPercentage,
      status,
      lastPlayedAt: now,
      ...(status === ProgressStatus.COMPLETED && !wasCompleted
        ? { completedAt: now }
        : {}),
    });
  }

  async submitResponse(
    assignmentId: string,
    dto: SubmitResponseDto,
    user: AuthenticatedUser,
  ) {
    const assignment = await this.getOwnedAssignment(assignmentId, user);
    const question = assignment.video.questions.find(
      (q) => q.id === dto.questionId,
    );
    if (!question) {
      throw new NotFoundException(
        'QUESTION_NOT_FOUND',
        'Question not found for this video',
      );
    }

    const existing = await this.learningRepository.findResponse(
      assignmentId,
      dto.questionId,
    );
    if (existing) {
      throw new ConflictException(
        'ALREADY_ANSWERED',
        'This question has already been answered',
      );
    }

    const { answer, isCorrect } = this.gradeResponse(question, dto);
    return this.learningRepository.createResponse(
      assignmentId,
      dto.questionId,
      answer,
      isCorrect,
    );
  }

  private gradeResponse(
    question: OwnedQuestion,
    dto: SubmitResponseDto,
  ): { answer: Prisma.InputJsonValue; isCorrect: boolean | null } {
    if (question.type === QuestionType.SINGLE_CHOICE) {
      if (!dto.optionId) {
        throw new AppException(
          'INVALID_ANSWER',
          'optionId is required for single choice questions',
          HttpStatus.BAD_REQUEST,
        );
      }
      const option = question.options.find((o) => o.id === dto.optionId);
      if (!option) {
        throw new AppException(
          'INVALID_ANSWER',
          'optionId does not belong to this question',
          HttpStatus.BAD_REQUEST,
        );
      }
      return {
        answer: { optionId: dto.optionId },
        isCorrect: option.isCorrect,
      };
    }

    if (question.type === QuestionType.MULTIPLE_CHOICE) {
      if (!dto.optionIds || dto.optionIds.length === 0) {
        throw new AppException(
          'INVALID_ANSWER',
          'optionIds is required for multiple choice questions',
          HttpStatus.BAD_REQUEST,
        );
      }
      const validIds = new Set(question.options.map((o) => o.id));
      const allValid = dto.optionIds.every((id) => validIds.has(id));
      if (!allValid) {
        throw new AppException(
          'INVALID_ANSWER',
          'optionIds contains an option that does not belong to this question',
          HttpStatus.BAD_REQUEST,
        );
      }
      const correctIds = new Set(
        question.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      const submitted = new Set(dto.optionIds);
      const isCorrect =
        correctIds.size === submitted.size &&
        [...correctIds].every((id) => submitted.has(id));
      return { answer: { optionIds: dto.optionIds }, isCorrect };
    }

    // SHORT_ANSWER — not auto-graded, stored for admin review
    if (!dto.text || dto.text.trim().length === 0) {
      throw new AppException(
        'INVALID_ANSWER',
        'text is required for short answer questions',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { answer: { text: dto.text }, isCorrect: null };
  }

  private async getOwnedAssignment(
    assignmentId: string,
    user: AuthenticatedUser,
  ): Promise<OwnedAssignment> {
    const assignment =
      await this.learningRepository.findAssignmentById(assignmentId);
    if (!assignment) {
      throw new NotFoundException(
        'ASSIGNMENT_NOT_FOUND',
        'Assignment not found',
      );
    }
    if (assignment.learnerId !== user.id) {
      throw new ForbiddenException(
        'ASSIGNMENT_FORBIDDEN',
        'You do not have access to this assignment',
      );
    }
    return assignment;
  }
}
