import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionType } from '@prisma/client';
import { QuestionOptionInputDto } from './question-option-input.dto';

export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiProperty({
    minimum: 0,
    description: 'Seconds into the video this question appears',
  })
  @IsInt()
  @Min(0)
  timestampSeconds: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({
    type: [QuestionOptionInputDto],
    description:
      'Required for SINGLE_CHOICE/MULTIPLE_CHOICE, omit for SHORT_ANSWER',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];
}
