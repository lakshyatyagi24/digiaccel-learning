import { Injectable } from '@nestjs/common';
import { Prisma, ProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const assignmentWithVideoInclude = {
  video: {
    include: {
      questions: {
        include: { options: true },
        orderBy: { order: 'asc' as const },
      },
    },
  },
  progress: true,
} satisfies Prisma.AssignmentInclude;

@Injectable()
export class LearningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAssignmentsForLearner(
    learnerId: string,
    page: number,
    limit: number,
  ) {
    const where: Prisma.AssignmentWhereInput = { learnerId };
    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              durationSeconds: true,
            },
          },
          progress: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return { items, total };
  }

  findAssignmentById(id: string) {
    return this.prisma.assignment.findUnique({
      where: { id },
      include: assignmentWithVideoInclude,
    });
  }

  findResponsesForAssignment(assignmentId: string) {
    return this.prisma.quizResponse.findMany({ where: { assignmentId } });
  }

  findResponse(assignmentId: string, questionId: string) {
    return this.prisma.quizResponse.findUnique({
      where: { assignmentId_questionId: { assignmentId, questionId } },
    });
  }

  createResponse(
    assignmentId: string,
    questionId: string,
    answer: Prisma.InputJsonValue,
    isCorrect: boolean | null,
  ) {
    return this.prisma.quizResponse.create({
      data: { assignmentId, questionId, answer, isCorrect },
    });
  }

  updateProgress(
    assignmentId: string,
    data: {
      lastWatchedSeconds: number;
      maxWatchedSeconds: number;
      completionPercentage: number;
      status: ProgressStatus;
      lastPlayedAt: Date;
      completedAt?: Date;
    },
  ) {
    return this.prisma.learningProgress.update({
      where: { assignmentId },
      data,
    });
  }
}
