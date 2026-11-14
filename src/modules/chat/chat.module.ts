import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ComplaintsModule } from '../complaints/complaints.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ChatController } from './chat.controller.js';
import { ChatRepository } from './chat.repository.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [AiModule, ComplaintsModule, StorageModule],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
})
export class ChatModule {}
