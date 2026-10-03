import { Module } from '@nestjs/common';

import { ControlPlaneModule } from '../../control-plane/control-plane.module.js';
import { PasswordHasher } from '../application/password-hasher.js';
import { AdminUserRepository } from '../infrastructure/admin-user.repository.js';

// Only what the CLI needs: no HTTP controller, guards or rate limiting.
@Module({
	imports: [ControlPlaneModule],
	providers: [PasswordHasher, AdminUserRepository],
})
export class AdminCliModule {}
