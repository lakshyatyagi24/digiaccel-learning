import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListAssignmentsQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  videoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  learnerId?: string;
}
