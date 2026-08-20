import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';
import { VideosModule } from '../videos/videos.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [VideosModule, UsersModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
  exports: [AssignmentsRepository],
})
export class AssignmentsModule {}
