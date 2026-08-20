import {
  PrismaClient,
  ProgressStatus,
  QuestionType,
  Role,
  VideoStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await argon2.hash('Admin@123');
  const learnerPasswordHash = await argon2.hash('Learner@123');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const learner = await prisma.user.upsert({
    where: { email: 'learner@example.com' },
    update: {},
    create: {
      name: 'Learner User',
      email: 'learner@example.com',
      passwordHash: learnerPasswordHash,
      role: Role.LEARNER,
    },
  });

  const secondLearner = await prisma.user.upsert({
    where: { email: 'learner2@example.com' },
    update: {},
    create: {
      name: 'Second Learner',
      email: 'learner2@example.com',
      passwordHash: learnerPasswordHash,
      role: Role.LEARNER,
    },
  });

  const jsVideo = await prisma.video.create({
    data: {
      title: 'JavaScript Fundamentals',
      description:
        'An introduction to core JavaScript concepts every developer should know.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=800',
      videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      durationSeconds: 52,
      status: VideoStatus.PUBLISHED,
      publishedAt: new Date(),
      createdById: admin.id,
      questions: {
        create: [
          {
            type: QuestionType.SINGLE_CHOICE,
            timestampSeconds: 5,
            text: 'What keyword declares a block-scoped variable?',
            order: 0,
            options: {
              create: [
                { text: 'var', isCorrect: false, order: 0 },
                { text: 'let', isCorrect: true, order: 1 },
                { text: 'function', isCorrect: false, order: 2 },
              ],
            },
          },
          {
            type: QuestionType.MULTIPLE_CHOICE,
            timestampSeconds: 15,
            text: 'Which of these are primitive types in JavaScript?',
            order: 1,
            options: {
              create: [
                { text: 'string', isCorrect: true, order: 0 },
                { text: 'number', isCorrect: true, order: 1 },
                { text: 'object', isCorrect: false, order: 2 },
                { text: 'boolean', isCorrect: true, order: 3 },
              ],
            },
          },
          {
            type: QuestionType.SHORT_ANSWER,
            timestampSeconds: 30,
            text: 'In one sentence, what does the `this` keyword refer to inside a regular function?',
            order: 2,
          },
          {
            type: QuestionType.SINGLE_CHOICE,
            timestampSeconds: 45,
            text: 'What does `===` check that `==` does not?',
            order: 3,
            options: {
              create: [
                {
                  text: 'Type, in addition to value',
                  isCorrect: true,
                  order: 0,
                },
                {
                  text: 'Nothing, they are identical',
                  isCorrect: false,
                  order: 1,
                },
                { text: 'Only reference equality', isCorrect: false, order: 2 },
              ],
            },
          },
        ],
      },
    },
    include: { questions: { include: { options: true } } },
  });

  await prisma.video.create({
    data: {
      title: 'Database Design Basics',
      description: 'Relational vs document databases and when to use each.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800',
      videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      durationSeconds: 52,
      status: VideoStatus.DRAFT,
      createdById: admin.id,
      questions: {
        create: [
          {
            type: QuestionType.SINGLE_CHOICE,
            timestampSeconds: 12,
            text: 'Which of these enforces referential integrity out of the box?',
            order: 0,
            options: {
              create: [
                { text: 'PostgreSQL foreign keys', isCorrect: true, order: 0 },
                { text: 'A plain JSON file', isCorrect: false, order: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  const reactVideo = await prisma.video.create({
    data: {
      title: 'React Basics',
      description:
        'Components, props, and state — the building blocks of React apps.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800',
      videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      durationSeconds: 52,
      status: VideoStatus.PUBLISHED,
      publishedAt: new Date(),
      createdById: admin.id,
      questions: {
        create: [
          {
            type: QuestionType.SINGLE_CHOICE,
            timestampSeconds: 20,
            text: 'What hook lets a function component hold local state?',
            order: 0,
            options: {
              create: [
                { text: 'useState', isCorrect: true, order: 0 },
                { text: 'useEffect', isCorrect: false, order: 1 },
                { text: 'useMemo', isCorrect: false, order: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  const assignment = await prisma.assignment.create({
    data: {
      videoId: jsVideo.id,
      learnerId: learner.id,
      assignedById: admin.id,
      progress: {
        create: {
          lastWatchedSeconds: 18,
          maxWatchedSeconds: 18,
          completionPercentage: Math.round((18 / 52) * 100),
          status: ProgressStatus.IN_PROGRESS,
          lastPlayedAt: new Date(),
        },
      },
    },
  });

  const [q1, q2] = jsVideo.questions;
  const q1CorrectOption = q1.options.find((o) => o.isCorrect);
  const q2WrongOption = q2.options.find((o) => !o.isCorrect);

  if (q1CorrectOption) {
    await prisma.quizResponse.create({
      data: {
        assignmentId: assignment.id,
        questionId: q1.id,
        answer: { optionId: q1CorrectOption.id },
        isCorrect: true,
      },
    });
  }

  if (q2WrongOption) {
    await prisma.quizResponse.create({
      data: {
        assignmentId: assignment.id,
        questionId: q2.id,
        answer: { optionIds: [q2WrongOption.id] },
        isCorrect: false,
      },
    });
  }

  await prisma.assignment.create({
    data: {
      videoId: reactVideo.id,
      learnerId: secondLearner.id,
      assignedById: admin.id,
      progress: { create: {} },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log('Admin login: admin@example.com / Admin@123');
  // eslint-disable-next-line no-console
  console.log(
    'Learner login: learner@example.com / Learner@123 (has in-progress JS Fundamentals)',
  );
  // eslint-disable-next-line no-console
  console.log(
    'Second learner: learner2@example.com / Learner@123 (not-started React Basics)',
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
