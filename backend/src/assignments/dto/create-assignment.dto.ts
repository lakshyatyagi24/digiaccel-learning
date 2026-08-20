import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  videoId: string;

  @ApiProperty()
  @IsUUID()
  learnerId: string;
}
