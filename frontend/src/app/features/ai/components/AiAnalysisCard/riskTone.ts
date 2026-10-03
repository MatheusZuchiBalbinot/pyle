import type { AiRiskLevel } from '@/app/api/adminApiTypes';
import type { StatusValue } from '@/app/ui/StatusBadge/StatusBadge';
import type { StatusIntroTone } from '@/app/ui/StatusIntro/StatusIntro';

export const RISK_STATUS: Readonly<Record<AiRiskLevel, StatusValue>> = { low: 'healthy', medium: 'degraded', high: 'down' };

export const RISK_TONE: Readonly<Record<AiRiskLevel, StatusIntroTone>> = { low: 'healthy', medium: 'warning', high: 'danger' };
