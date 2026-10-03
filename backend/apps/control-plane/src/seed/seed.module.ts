import { Module } from '@nestjs/common';

import { PasswordHasher } from '../auth/application/password-hasher.js';
import { AdminUserRepository } from '../auth/infrastructure/admin-user.repository.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { SeedTrafficRepository } from './seed-traffic.repository.js';

// No schedulers or controllers: nothing that works on its own.
@Module({
	imports: [ControlPlaneModule],
	providers: [PasswordHasher, AdminUserRepository, SeedTrafficRepository],
})
export class SeedModule {}
