import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { VideosRepository } from './videos.repository';

@Module({
  controllers: [VideosController],
  providers: [VideosService, VideosRepository],
  exports: [VideosRepository],
})
export class VideosModule {}
