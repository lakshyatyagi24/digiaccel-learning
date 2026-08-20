import { Injectable } from '@nestjs/common';
import { Prisma, ProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProgressReport(params: {
    learnerId?: string;
    videoId?: string;
    status?: ProgressStatus;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AssignmentWhereInput = {
      ...(params.learnerId ? { learnerId: params.learnerId } : {}),
      ...(params.videoId ? { videoId: params.videoId } : {}),
      ...(params.status ? { progress: { status: params.status } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          learner: { select: { id: true, name: true, email: true } },
          video: {
            select: {
              id: true,
              title: true,
              durationSeconds: true,
              _count: { select: { questions: true } },
            },
          },
          progress: true,
          responses: true,
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return { items, total };
  }
}
