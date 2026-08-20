import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { LearningService } from './learning.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('learning')
@ApiBearerAuth()
@Roles(Role.LEARNER)
@Controller('learning/assignments')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get()
  listMine(
    @Query() query: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learningService.listMyAssignments(
      user.id,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learningService.getAssignment(id, user);
  }

  @Get(':id/progress')
  getProgress(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learningService.getProgress(id, user);
  }

  @Put(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learningService.updateProgress(id, dto, user);
  }

  @Post(':id/responses')
  submitResponse(
    @Param('id') id: string,
    @Body() dto: SubmitResponseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learningService.submitResponse(id, dto, user);
  }
}
