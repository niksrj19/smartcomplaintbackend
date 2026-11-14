import { Module } from '@nestjs/common';
import { AdaptersModule } from './adapters/adapters.module.js';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthCoreModule } from './modules/auth-core/auth-core.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { CitizenAuthModule } from './modules/citizen-auth/citizen-auth.module.js';
import { ComplaintsModule } from './modules/complaints/complaints.module.js';
import { DepartmentsModule } from './modules/departments/departments.module.js';
import { GuardrailsModule } from './modules/guardrails/guardrails.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { StaffAuthModule } from './modules/staff-auth/staff-auth.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AdaptersModule,
    RateLimitModule,
    AuthCoreModule,
    GuardrailsModule,
    DepartmentsModule,
    StaffAuthModule,
    CitizenAuthModule,
    StorageModule,
    AiModule,
    ComplaintsModule,
    AdminDashboardModule,
    AnalyticsModule,
    ChatModule,
    NotificationsModule,
    MessagingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
