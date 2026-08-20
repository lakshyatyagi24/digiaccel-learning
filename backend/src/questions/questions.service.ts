import { Injectable } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { QuestionsRepository } from './questions.repository';
import { VideosRepository } from '../videos/videos.repository';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import {
  validateQuestionShape,
  validateTimestamp,
} from './question-validation';
import {
  AppException,
  ConflictException,
  NotFoundException,
} from '../common/exceptions/app.exception';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly questionsRepository: QuestionsRepository,
    private readonly videosRepository: VideosRepository,
  ) {}

  async create(videoId: string, dto: CreateQuestionDto) {
    const video = await this.videosRepository.findById(videoId);
    if (!video) {
      throw new NotFoundException('VIDEO_NOT_FOUND', 'Video not found');
    }
    validateTimestamp(dto.timestampSeconds, video.durationSeconds);
    validateQuestionShape(dto.type, dto.options);
    return this.questionsRepository.create(videoId, dto);
  }

  async update(videoId: string, questionId: string, dto: UpdateQuestionDto) {
    const question = await this.getOwnedQuestion(videoId, questionId);

    const hasResponses =
      await this.questionsRepository.hasResponses(questionId);
    if (hasResponses) {
      throw new ConflictException(
        'QUESTION_LOCKED',
        'Question already has learner responses and cannot be modified',
      );
    }

    if (dto.type && !dto.options) {
      throw new AppException(
        'INVALID_QUESTION_OPTIONS',
        'Changing question type requires providing the new options',
        HttpStatus.BAD_REQUEST,
      );
    }

    const effectiveType: QuestionType = dto.type ?? question.type;
    if (dto.options) {
      validateQuestionShape(effectiveType, dto.options);
    }

    if (dto.timestampSeconds !== undefined) {
      const video = await this.videosRepository.findById(videoId);
      if (!video) {
        throw new NotFoundException('VIDEO_NOT_FOUND', 'Video not found');
      }
      validateTimestamp(dto.timestampSeconds, video.durationSeconds);
    }

    return this.questionsRepository.update(questionId, dto);
  }

  async delete(videoId: string, questionId: string) {
    await this.getOwnedQuestion(videoId, questionId);
    const hasResponses =
      await this.questionsRepository.hasResponses(questionId);
    if (hasResponses) {
      throw new ConflictException(
        'QUESTION_LOCKED',
        'Question already has learner responses and cannot be deleted',
      );
    }
    return this.questionsRepository.delete(questionId);
  }

  private async getOwnedQuestion(videoId: string, questionId: string) {
    const question =
      await this.questionsRepository.findByIdWithOptions(questionId);
    if (!question || question.videoId !== videoId) {
      throw new NotFoundException('QUESTION_NOT_FOUND', 'Question not found');
    }
    return question;
  }
}
