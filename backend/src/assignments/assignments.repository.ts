import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const listInclude = {
  video: {
    select: { id: true, title: true, durationSeconds: true, status: true },
  },
  learner: { select: { id: true, name: true, email: true } },
  progress: true,
} satisfies Prisma.AssignmentInclude;

@Injectable()
export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(videoId: string, learnerId: string, assignedById: string) {
    return this.prisma.assignment.create({
      data: {
        videoId,
        learnerId,
        assignedById,
        progress: { create: {} },
      },
      include: listInclude,
    });
  }

  async findMany(params: {
    videoId?: string;
    learnerId?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AssignmentWhereInput = {
      ...(params.videoId ? { videoId: params.videoId } : {}),
      ...(params.learnerId ? { learnerId: params.learnerId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: listInclude,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string) {
    return this.prisma.assignment.findUnique({
      where: { id },
      include: listInclude,
    });
  }
}
