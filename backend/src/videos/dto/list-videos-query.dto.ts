import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VideoStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListVideosQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: VideoStatus })
  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
