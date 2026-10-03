import { Module } from '@nestjs/common';

import { SystemHealthModule } from '../system-health/system-health.module.js';
import { HealthController } from './interface/health.controller.js';

@Module({ imports: [SystemHealthModule], controllers: [HealthController] })
export class HealthModule {}
