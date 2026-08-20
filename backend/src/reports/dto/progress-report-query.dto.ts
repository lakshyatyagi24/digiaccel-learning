import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ProgressStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ProgressReportQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  videoId?: string;

  @ApiPropertyOptional({ enum: ProgressStatus })
  @IsOptional()
  @IsEnum(ProgressStatus)
  status?: ProgressStatus;
}
