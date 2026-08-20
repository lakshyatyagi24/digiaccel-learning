import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateProgressDto {
  @ApiProperty({
    minimum: 0,
    description: 'Current playhead position in seconds',
  })
  @IsInt()
  @Min(0)
  currentTimeSeconds: number;
}
