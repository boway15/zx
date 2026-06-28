import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WEAK_SECRETS = new Set([
  'change-me-to-a-random-secret',
  'change-me-in-production',
  'change-me-admin-secret',
  'admin-change-me',
  'admin123',
  'change-me-admin-password',
]);

export function validateProductionConfig(config: ConfigService): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  if (!isProduction) return;

  const logger = new Logger('ProductionValidation');
  const errors: string[] = [];

  const jwtSecret = config.get<string>('jwt.secret') || '';
  const adminSecret = config.get<string>('jwt.adminSecret') || '';
  if (!jwtSecret || WEAK_SECRETS.has(jwtSecret)) {
    errors.push('JWT_SECRET must be set to a strong random value in production');
  }
  if (!adminSecret || WEAK_SECRETS.has(adminSecret)) {
    errors.push('ADMIN_JWT_SECRET must be set to a strong random value in production');
  }

  if (process.env.DB_SYNC !== 'false') {
    errors.push('DB_SYNC must be false in production');
  }

  if (config.get<boolean>('wechat.mockPay')) {
    errors.push('WECHAT_MOCK_PAY must be false in production');
  }

  if (config.get<boolean>('ttlock.mockUnlock')) {
    errors.push('TTLOCK_MOCK_UNLOCK must be false in production');
  }

  const lockId = config.get<number>('ttlock.lockId') || 0;
  if (!lockId) {
    errors.push('TTLOCK_LOCK_ID must be configured in production');
  }

  if (errors.length) {
    logger.error(`Production configuration invalid:\n- ${errors.join('\n- ')}`);
    throw new Error('Invalid production configuration');
  }

  logger.log('Production configuration validated');
}
