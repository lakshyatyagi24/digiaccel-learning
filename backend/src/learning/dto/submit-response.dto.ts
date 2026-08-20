import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class SubmitResponseDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiPropertyOptional({ description: 'Required for SINGLE_CHOICE' })
  @IsOptional()
  @IsUUID()
  optionId?: string;

  @ApiPropertyOptional({
    description: 'Required for MULTIPLE_CHOICE',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  optionIds?: string[];

  @ApiPropertyOptional({ description: 'Required for SHORT_ANSWER' })
  @IsOptional()
  @IsString()
  text?: string;
}
