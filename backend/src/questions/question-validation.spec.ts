import { QuestionType } from '@prisma/client';
import {
  validateQuestionShape,
  validateTimestamp,
} from './question-validation';

function opt(text: string, isCorrect: boolean) {
  return { text, isCorrect };
}

describe('validateQuestionShape', () => {
  it('rejects SHORT_ANSWER with options attached', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SHORT_ANSWER, [opt('a', true)]),
    ).toThrow();
  });

  it('accepts SHORT_ANSWER with no options', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SHORT_ANSWER, undefined),
    ).not.toThrow();
  });

  it('rejects a choice question with fewer than 2 options', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SINGLE_CHOICE, [opt('a', true)]),
    ).toThrow();
  });

  it('rejects SINGLE_CHOICE with zero correct options', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SINGLE_CHOICE, [
        opt('a', false),
        opt('b', false),
      ]),
    ).toThrow();
  });

  it('rejects SINGLE_CHOICE with more than one correct option', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SINGLE_CHOICE, [
        opt('a', true),
        opt('b', true),
      ]),
    ).toThrow();
  });

  it('accepts SINGLE_CHOICE with exactly one correct option', () => {
    expect(() =>
      validateQuestionShape(QuestionType.SINGLE_CHOICE, [
        opt('a', true),
        opt('b', false),
      ]),
    ).not.toThrow();
  });

  it('rejects MULTIPLE_CHOICE with zero correct options', () => {
    expect(() =>
      validateQuestionShape(QuestionType.MULTIPLE_CHOICE, [
        opt('a', false),
        opt('b', false),
      ]),
    ).toThrow();
  });

  it('accepts MULTIPLE_CHOICE with more than one correct option', () => {
    expect(() =>
      validateQuestionShape(QuestionType.MULTIPLE_CHOICE, [
        opt('a', true),
        opt('b', true),
        opt('c', false),
      ]),
    ).not.toThrow();
  });
});

describe('validateTimestamp', () => {
  it('accepts a timestamp within video duration', () => {
    expect(() => validateTimestamp(100, 300)).not.toThrow();
  });

  it('accepts a timestamp exactly at the video duration boundary', () => {
    expect(() => validateTimestamp(300, 300)).not.toThrow();
  });

  it('rejects a timestamp beyond video duration', () => {
    expect(() => validateTimestamp(301, 300)).toThrow();
  });
});
