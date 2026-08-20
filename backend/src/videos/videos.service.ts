import { HttpStatus, Injectable } from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { VideosRepository } from './videos.repository';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';
import {
  AppException,
  ConflictException,
  NotFoundException,
} from '../common/exceptions/app.exception';

@Injectable()
export class VideosService {
  constructor(private readonly videosRepository: VideosRepository) {}

  create(dto: CreateVideoDto, createdById: string) {
    return this.videosRepository.create(dto, createdById);
  }

  async list(query: ListVideosQueryDto) {
    const { items, total } = await this.videosRepository.findMany({
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
    return { items, meta: { page: query.page, limit: query.limit, total } };
  }

  async getById(id: string) {
    const video = await this.videosRepository.findById(id);
    if (!video) {
      throw new NotFoundException('VIDEO_NOT_FOUND', 'Video not found');
    }
    return video;
  }

  async update(id: string, dto: UpdateVideoDto) {
    await this.getById(id);
    return this.videosRepository.update(id, dto);
  }

  async publish(id: string) {
    const video = await this.getById(id);
    if (video.status === VideoStatus.PUBLISHED) {
      throw new AppException(
        'VIDEO_ALREADY_PUBLISHED',
        'Video is already published',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.videosRepository.setStatus(
      id,
      VideoStatus.PUBLISHED,
      video.publishedAt ?? new Date(),
    );
  }

  async unpublish(id: string) {
    const video = await this.getById(id);
    if (video.status === VideoStatus.DRAFT) {
      throw new AppException(
        'VIDEO_ALREADY_DRAFT',
        'Video is already a draft',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.videosRepository.setStatus(id, VideoStatus.DRAFT);
  }

  async delete(id: string) {
    await this.getById(id);
    const assignmentCount = await this.videosRepository.countAssignments(id);
    if (assignmentCount > 0) {
      throw new ConflictException(
        'VIDEO_HAS_ASSIGNMENTS',
        'Video has learner assignments and cannot be deleted',
      );
    }
    return this.videosRepository.delete(id);
  }
}
