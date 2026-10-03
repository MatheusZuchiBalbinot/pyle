import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { PlatformSettingsService } from './application/platform-settings.service.js';
import { PlatformSettingsController } from './interface/platform-settings.controller.js';

@Module({
	imports: [AuthModule, ControlPlaneModule],
	controllers: [PlatformSettingsController],
	providers: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
