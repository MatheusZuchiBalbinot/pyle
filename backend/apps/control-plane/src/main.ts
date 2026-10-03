// First: modules read process.env while Nest registers them.
import '@pyle/shared/config/load-backend-env.js';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

import { ADMIN_BEARER_SCHEME_NAME } from './config/swagger-auth-schemes.js';
import { validateStartupConfig } from './config/validate-startup-config.js';
import { shouldCompress } from './observability/interface/should-compress.js';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const SWAGGER_UI_PATH = 'api-docs';

// A map of every route: for development only.
function isSwaggerEnabled(): boolean {
	return process.env.NODE_ENV !== 'production';
}

function setupSwagger(app: INestApplication): void {
	const config = new DocumentBuilder()
		.setTitle('Pyle control plane API')
		.setDescription(
			'Admin API of the pyle gateway: services, instances, routes, consumers and API keys, traffic, alerts and AI. Client traffic goes to the gateway (data plane), not here.',
		)
		.setVersion('1.0')
		// AdminAuthGuard's operator session or service token.
		.addBearerAuth({ type: 'http', scheme: 'bearer' }, ADMIN_BEARER_SCHEME_NAME)
		.build();
	const document = SwaggerModule.createDocument(app, config);

	SwaggerModule.setup(SWAGGER_UI_PATH, app, document);
}

async function bootstrap(): Promise<void> {
	// Fails fast, naming the variable, rather than as a 401 or 500 later.
	validateStartupConfig();
	const app = await NestFactory.create(AppModule);

	// SIGTERM (docker stop) runs every OnModuleDestroy: schedulers, the scaling
	// reconciler and the connections stop cleanly instead of mid-work.
	app.enableShutdownHooks();
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
	// No CSP: this serves JSON, and Swagger UI needs inline scripts.
	app.use(helmet({ contentSecurityPolicy: false }));
	// The Overview is ~50 KB of JSON per refresh; SSE streams are left alone.
	app.use(compression({ filter: shouldCompress }));
	// The console's origin only; credentials carry the refresh-token cookie.
	app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN, credentials: true });

	if (isSwaggerEnabled()) {
		setupSwagger(app);
	}

	await app.listen(process.env.PORT ?? DEFAULT_PORT);
}

await bootstrap();
