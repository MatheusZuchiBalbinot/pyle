import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { AdminNotificationsService } from './application/admin-notifications.service.js';
import { AdminNotificationRepository } from './infrastructure/admin-notification.repository.js';
import { AdminNotificationsController } from './interface/admin-notifications.controller.js';

@Module({
	imports: [ControlPlaneModule, AuthModule],
	controllers: [AdminNotificationsController],
	providers: [AdminNotificationsService, AdminNotificationRepository],
})
export class AdminNotificationsModule {}
