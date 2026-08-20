import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role, VideoStatus } from '@prisma/client';
import { AssignmentsRepository } from './assignments.repository';
import { VideosRepository } from '../videos/videos.repository';
import { UsersRepository } from '../users/users.repository';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto';
import {
  AppException,
  ConflictException,
  NotFoundException,
} from '../common/exceptions/app.exception';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly assignmentsRepository: AssignmentsRepository,
    private readonly videosRepository: VideosRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async create(dto: CreateAssignmentDto, assignedById: string) {
    const video = await this.videosRepository.findById(dto.videoId);
    if (!video) {
      throw new NotFoundException('VIDEO_NOT_FOUND', 'Video not found');
    }
    if (video.status !== VideoStatus.PUBLISHED) {
      throw new AppException(
        'VIDEO_NOT_PUBLISHED',
        'Only published videos can be assigned',
        HttpStatus.BAD_REQUEST,
      );
    }

    const learner = await this.usersRepository.findById(dto.learnerId);
    if (!learner) {
      throw new NotFoundException('LEARNER_NOT_FOUND', 'Learner not found');
    }
    if (learner.role !== Role.LEARNER) {
      throw new AppException(
        'INVALID_LEARNER',
        'Target user is not a learner',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.assignmentsRepository.create(
        dto.videoId,
        dto.learnerId,
        assignedById,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'ASSIGNMENT_ALREADY_EXISTS',
          'This video is already assigned to this learner',
        );
      }
      throw error;
    }
  }

  async list(query: ListAssignmentsQueryDto) {
    const { items, total } = await this.assignmentsRepository.findMany({
      videoId: query.videoId,
      learnerId: query.learnerId,
      page: query.page,
      limit: query.limit,
    });
    return { items, meta: { page: query.page, limit: query.limit, total } };
  }
}
