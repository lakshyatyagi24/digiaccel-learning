import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('questions')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('videos/:videoId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(@Param('videoId') videoId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(videoId, dto);
  }

  @Patch(':questionId')
  update(
    @Param('videoId') videoId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(videoId, questionId, dto);
  }

  @Delete(':questionId')
  delete(
    @Param('videoId') videoId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.questionsService.delete(videoId, questionId);
  }
}
