import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(videoId: string, dto: CreateQuestionDto) {
    return this.prisma.question.create({
      data: {
        videoId,
        type: dto.type,
        timestampSeconds: dto.timestampSeconds,
        text: dto.text,
        order: dto.order,
        options: dto.options
          ? {
              create: dto.options.map((o, i) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
  }

  findByIdWithOptions(questionId: string) {
    return this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
  }

  hasResponses(questionId: string) {
    return this.prisma.quizResponse
      .count({ where: { questionId } })
      .then((count) => count > 0);
  }

  update(questionId: string, dto: UpdateQuestionDto) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.timestampSeconds !== undefined
          ? { timestampSeconds: dto.timestampSeconds }
          : {}),
        ...(dto.text ? { text: dto.text } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.options
          ? {
              options: {
                deleteMany: {},
                create: dto.options.map((o, i) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                  order: i,
                })),
              },
            }
          : {}),
      },
      include: { options: true },
    });
  }

  delete(questionId: string) {
    return this.prisma.question.delete({ where: { id: questionId } });
  }
}
