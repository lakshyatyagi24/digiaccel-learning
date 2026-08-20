import { Injectable } from '@nestjs/common';
import { ProgressStatus } from '@prisma/client';
import { ReportsRepository } from './reports.repository';
import { ProgressReportQueryDto } from './dto/progress-report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async progressReport(query: ProgressReportQueryDto) {
    const { items, total } = await this.reportsRepository.findProgressReport({
      learnerId: query.learnerId,
      videoId: query.videoId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    const rows = items.map((a) => {
      const graded = a.responses.filter((r) => r.isCorrect !== null);
      const correctCount = graded.filter((r) => r.isCorrect).length;
      const accuracy =
        graded.length > 0
          ? Math.round((correctCount / graded.length) * 100)
          : null;

      return {
        assignmentId: a.id,
        learner: a.learner,
        video: {
          id: a.video.id,
          title: a.video.title,
          durationSeconds: a.video.durationSeconds,
        },
        completionPercentage: a.progress?.completionPercentage ?? 0,
        status: a.progress?.status ?? ProgressStatus.NOT_STARTED,
        lastWatchedSeconds: a.progress?.lastWatchedSeconds ?? 0,
        completedAt: a.progress?.completedAt ?? null,
        totalQuestions: a.video._count.questions,
        responsesCount: a.responses.length,
        accuracy,
      };
    });

    return {
      items: rows,
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
