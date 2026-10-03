-- CreateEnum
CREATE TYPE "AiRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AiAnalysisScope" AS ENUM ('platform', 'route', 'service');

-- CreateEnum
CREATE TYPE "AiTrend" AS ENUM ('improved', 'stable', 'worsened');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "GatewayAlertKind" AS ENUM ('route_p95_latency', 'route_error_rate', 'instance_unhealthy', 'circuit_open');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertSubjectType" AS ENUM ('route', 'service', 'instance');

-- CreateEnum
CREATE TYPE "ConfigEntityType" AS ENUM ('service', 'instance', 'route', 'consumer', 'api_key', 'alert_rule');

-- CreateEnum
CREATE TYPE "ConfigChangeAction" AS ENUM ('created', 'updated', 'deleted');

-- CreateEnum
CREATE TYPE "LoadBalancingStrategy" AS ENUM ('round_robin', 'least_connections', 'weighted_random');

-- CreateEnum
CREATE TYPE "InstanceSource" AS ENUM ('static', 'managed');

-- CreateEnum
CREATE TYPE "ScalingProfile" AS ENUM ('demo_orders', 'demo_users', 'demo_catalog');

-- CreateEnum
CREATE TYPE "ManagedInstanceState" AS ENUM ('provisioning', 'running', 'draining', 'failed');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS');

-- CreateEnum
CREATE TYPE "AdminNotificationCategory" AS ENUM ('traffic', 'instance', 'system', 'ai');

-- CreateEnum
CREATE TYPE "AdminNotificationSeverity" AS ENUM ('info', 'success', 'warning', 'danger');

-- CreateEnum
CREATE TYPE "SystemHealthComponent" AS ENUM ('control_plane_db_primary', 'control_plane_redis', 'gateway', 'docker');

-- CreateEnum
CREATE TYPE "SystemHealthStatus" AS ENUM ('up', 'degraded', 'down');

-- CreateEnum
CREATE TYPE "InstanceStateKind" AS ENUM ('health', 'circuit');

-- CreateEnum
CREATE TYPE "InstanceState" AS ENUM ('healthy', 'unhealthy', 'circuit_closed', 'circuit_open', 'circuit_half_open');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "scope" "AiAnalysisScope" NOT NULL,
    "subjectId" TEXT,
    "subjectName" TEXT,
    "windowMinutes" INTEGER,
    "summary" TEXT NOT NULL,
    "riskLevel" "AiRiskLevel" NOT NULL,
    "highlights" TEXT[],
    "recommendations" TEXT[],
    "suggestedActions" JSONB NOT NULL DEFAULT '[]',
    "trend" "AiTrend",
    "trendSummary" TEXT,
    "previousAnalysisId" TEXT,
    "model" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysisMessage" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysisMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayAlert" (
    "id" TEXT NOT NULL,
    "kind" "GatewayAlertKind" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "subjectType" "AlertSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GatewayAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRuleConfig" (
    "id" TEXT NOT NULL,
    "kind" "GatewayAlertKind" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION,
    "sustainedWindows" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigChangeEvent" (
    "id" TEXT NOT NULL,
    "entityType" "ConfigEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ConfigChangeAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "actorEmail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lbStrategy" "LoadBalancingStrategy" NOT NULL DEFAULT 'round_robin',
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "retryMaxAttempts" INTEGER NOT NULL DEFAULT 2,
    "healthCheckPath" TEXT NOT NULL DEFAULT '/health',
    "healthCheckIntervalMs" INTEGER NOT NULL DEFAULT 5000,
    "healthCheckTimeoutMs" INTEGER NOT NULL DEFAULT 2000,
    "healthyThreshold" INTEGER NOT NULL DEFAULT 2,
    "unhealthyThreshold" INTEGER NOT NULL DEFAULT 3,
    "circuitFailureThreshold" INTEGER NOT NULL DEFAULT 5,
    "circuitCooldownMs" INTEGER NOT NULL DEFAULT 15000,
    "scalingProfile" "ScalingProfile",
    "desiredManagedReplicas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceInstance" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "source" "InstanceSource" NOT NULL DEFAULT 'static',
    "containerName" TEXT,
    "hostPort" INTEGER,
    "scalingState" "ManagedInstanceState",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pathPrefix" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "stripPrefix" BOOLEAN NOT NULL DEFAULT true,
    "methods" "HttpMethod"[],
    "isAuthRequired" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMinute" INTEGER,
    "timeoutMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerRouteAccess" (
    "consumerId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,

    CONSTRAINT "ConsumerRouteAccess_pkey" PRIMARY KEY ("consumerId","routeId")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "category" "AdminNotificationCategory" NOT NULL,
    "severity" "AdminNotificationSeverity" NOT NULL,
    "eventType" TEXT NOT NULL,
    "subjectType" "AlertSubjectType",
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHealthEvent" (
    "id" TEXT NOT NULL,
    "component" "SystemHealthComponent" NOT NULL,
    "status" "SystemHealthStatus" NOT NULL,
    "detail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteInstanceSample" (
    "id" TEXT NOT NULL,
    "flushKey" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "routeId" TEXT,
    "instanceId" TEXT,
    "requestCount" INTEGER NOT NULL,
    "status2xx" INTEGER NOT NULL,
    "status3xx" INTEGER NOT NULL,
    "status4xx" INTEGER NOT NULL,
    "status5xx" INTEGER NOT NULL,
    "rateLimitedCount" INTEGER NOT NULL,
    "gatewayErrorCount" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "latencyBuckets" INTEGER[],
    "latencySumMs" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RouteInstanceSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteConsumerSample" (
    "id" TEXT NOT NULL,
    "flushKey" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "routeId" TEXT,
    "consumerId" TEXT,
    "requestCount" INTEGER NOT NULL,
    "status4xx" INTEGER NOT NULL,
    "status5xx" INTEGER NOT NULL,
    "rateLimitedCount" INTEGER NOT NULL,
    "latencyBuckets" INTEGER[],
    "latencySumMs" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RouteConsumerSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceStateEvent" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "kind" "InstanceStateKind" NOT NULL,
    "fromState" "InstanceState" NOT NULL,
    "toState" "InstanceState" NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstanceStateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRefreshToken_tokenHash_key" ON "AdminRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminRefreshToken_userId_expiresAt_idx" ON "AdminRefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminRefreshToken_expiresAt_idx" ON "AdminRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AiAnalysis_scope_subjectId_requestedAt_idx" ON "AiAnalysis"("scope", "subjectId", "requestedAt");

-- CreateIndex
CREATE INDEX "AiAnalysis_requestedAt_idx" ON "AiAnalysis"("requestedAt");

-- CreateIndex
CREATE INDEX "AiAnalysisMessage_analysisId_createdAt_idx" ON "AiAnalysisMessage"("analysisId", "createdAt");

-- CreateIndex
CREATE INDEX "GatewayAlert_subjectType_subjectId_resolvedAt_idx" ON "GatewayAlert"("subjectType", "subjectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "GatewayAlert_resolvedAt_idx" ON "GatewayAlert"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRuleConfig_kind_key" ON "AlertRuleConfig"("kind");

-- CreateIndex
CREATE INDEX "ConfigChangeEvent_occurredAt_idx" ON "ConfigChangeEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "ConfigChangeEvent_entityType_entityId_occurredAt_idx" ON "ConfigChangeEvent"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "Service_deletedAt_idx" ON "Service"("deletedAt");

-- CreateIndex
CREATE INDEX "ServiceInstance_serviceId_deletedAt_idx" ON "ServiceInstance"("serviceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Route_serviceId_deletedAt_idx" ON "Route"("serviceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Consumer_deletedAt_idx" ON "Consumer"("deletedAt");

-- CreateIndex
CREATE INDEX "ConsumerRouteAccess_routeId_idx" ON "ConsumerRouteAccess"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_consumerId_idx" ON "ApiKey"("consumerId");

-- CreateIndex
CREATE INDEX "AdminNotification_readAt_createdAt_idx" ON "AdminNotification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_category_createdAt_idx" ON "AdminNotification"("category", "createdAt");

-- CreateIndex
CREATE INDEX "SystemHealthEvent_component_occurredAt_idx" ON "SystemHealthEvent"("component", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RouteInstanceSample_flushKey_key" ON "RouteInstanceSample"("flushKey");

-- CreateIndex
CREATE INDEX "RouteInstanceSample_bucketStart_idx" ON "RouteInstanceSample"("bucketStart");

-- CreateIndex
CREATE INDEX "RouteInstanceSample_routeId_bucketStart_idx" ON "RouteInstanceSample"("routeId", "bucketStart");

-- CreateIndex
CREATE INDEX "RouteInstanceSample_instanceId_bucketStart_idx" ON "RouteInstanceSample"("instanceId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "RouteConsumerSample_flushKey_key" ON "RouteConsumerSample"("flushKey");

-- CreateIndex
CREATE INDEX "RouteConsumerSample_bucketStart_idx" ON "RouteConsumerSample"("bucketStart");

-- CreateIndex
CREATE INDEX "RouteConsumerSample_consumerId_bucketStart_idx" ON "RouteConsumerSample"("consumerId", "bucketStart");

-- CreateIndex
CREATE INDEX "InstanceStateEvent_instanceId_occurredAt_idx" ON "InstanceStateEvent"("instanceId", "occurredAt");

-- CreateIndex
CREATE INDEX "InstanceStateEvent_occurredAt_idx" ON "InstanceStateEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "AdminRefreshToken" ADD CONSTRAINT "AdminRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisMessage" ADD CONSTRAINT "AiAnalysisMessage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AiAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceInstance" ADD CONSTRAINT "ServiceInstance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerRouteAccess" ADD CONSTRAINT "ConsumerRouteAccess_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerRouteAccess" ADD CONSTRAINT "ConsumerRouteAccess_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Partial unique indexes: Prisma cannot declare them in the schema.
-- A soft-deleted row must not block its slug, prefix, name, address or port.
CREATE UNIQUE INDEX "Service_slug_active_key" ON "Service" ("slug") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ServiceInstance_serviceId_name_active_key" ON "ServiceInstance" ("serviceId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ServiceInstance_hostPort_active_key" ON "ServiceInstance" ("hostPort") WHERE "deletedAt" IS NULL AND "hostPort" IS NOT NULL;
CREATE UNIQUE INDEX "Route_pathPrefix_active_key" ON "Route" ("pathPrefix") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Consumer_slug_active_key" ON "Consumer" ("slug") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "AdminUser_email_active_key" ON "AdminUser" ("email") WHERE "deletedAt" IS NULL;
-- One open alert per kind and subject, even with two evaluators racing.
CREATE UNIQUE INDEX "GatewayAlert_kind_subject_open_key" ON "GatewayAlert" ("kind", "subjectType", "subjectId") WHERE "resolvedAt" IS NULL;
