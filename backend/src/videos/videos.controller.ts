import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListVideosQueryDto } from './dto/list-videos-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('videos')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  create(@Body() dto: CreateVideoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.videosService.create(dto, user.id);
  }

  @Get()
  list(@Query() query: ListVideosQueryDto) {
    return this.videosService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.videosService.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.videosService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.videosService.delete(id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.videosService.publish(id);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.videosService.unpublish(id);
  }
}
