import { HttpStatus } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { QuestionOptionInputDto } from './dto/question-option-input.dto';

/**
 * Cross-field question shape rules the assessment calls out explicitly:
 * SHORT_ANSWER carries no options; SINGLE_CHOICE needs exactly one correct
 * option; MULTIPLE_CHOICE needs at least one. Kept as a pure function (not
 * buried in the service) so it's independently unit-testable.
 */
export function validateQuestionShape(
  type: QuestionType,
  options: QuestionOptionInputDto[] | undefined,
): void {
  if (type === QuestionType.SHORT_ANSWER) {
    if (options && options.length > 0) {
      throw new AppException(
        'INVALID_QUESTION_OPTIONS',
        'Short answer questions must not have options',
        HttpStatus.BAD_REQUEST,
      );
    }
    return;
  }

  if (!options || options.length < 2) {
    throw new AppException(
      'INVALID_QUESTION_OPTIONS',
      'Choice questions require at least 2 options',
      HttpStatus.BAD_REQUEST,
    );
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  if (type === QuestionType.SINGLE_CHOICE && correctCount !== 1) {
    throw new AppException(
      'INVALID_QUESTION_OPTIONS',
      'Single choice questions require exactly one correct option',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (type === QuestionType.MULTIPLE_CHOICE && correctCount < 1) {
    throw new AppException(
      'INVALID_QUESTION_OPTIONS',
      'Multiple choice questions require at least one correct option',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export function validateTimestamp(
  timestampSeconds: number,
  videoDurationSeconds: number,
): void {
  if (timestampSeconds > videoDurationSeconds) {
    throw new AppException(
      'INVALID_TIMESTAMP',
      'Question timestamp cannot exceed video duration',
      HttpStatus.BAD_REQUEST,
    );
  }
}
