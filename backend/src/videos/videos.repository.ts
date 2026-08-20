import { Injectable } from '@nestjs/common';
import { Prisma, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';

@Injectable()
export class VideosRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateVideoDto, createdById: string) {
    return this.prisma.video.create({
      data: { ...dto, createdById, status: VideoStatus.DRAFT },
    });
  }

  async findMany(params: {
    status?: VideoStatus;
    search?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.VideoWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? { title: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { questions: true, assignments: true } } },
      }),
      this.prisma.video.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string) {
    return this.prisma.video.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
  }

  update(id: string, dto: UpdateVideoDto) {
    return this.prisma.video.update({ where: { id }, data: dto });
  }

  setStatus(id: string, status: VideoStatus, publishedAt?: Date) {
    return this.prisma.video.update({
      where: { id },
      data: { status, ...(publishedAt ? { publishedAt } : {}) },
    });
  }

  delete(id: string) {
    return this.prisma.video.delete({ where: { id } });
  }

  countAssignments(id: string) {
    return this.prisma.assignment.count({ where: { videoId: id } });
  }
}
