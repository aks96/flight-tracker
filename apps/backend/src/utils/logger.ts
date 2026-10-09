import pino from 'pino';
import { config } from '@/config/env.js';

/**
 * Structured JSON logging in production (so Render/Datadog/CloudWatch can
 * parse and alert on it), pretty single-line output in development. Replaces
 * the previous console.log wrapper, which emitted unparseable free text and
 * dropped error stacks entirely.
 */
const pinoLogger = pino({
  level: config.logLevel,
  base: { service: 'flight-tracker-backend', env: config.nodeEnv },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'password_hash',
      'accessToken',
      'refreshToken',
      'pushToken',
      '*.password',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport: config.isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' } },
});

/** Normalize the `(message, errorOrData)` call style used across the codebase. */
function withContext(data?: unknown): Record<string, unknown> {
  if (data === undefined || data === null) return {};
  if (data instanceof Error) {
    return { err: { message: data.message, stack: data.stack, name: data.name } };
  }
  if (typeof data === 'object') return data as Record<string, unknown>;
  return { detail: data };
}

export default {
  debug: (message: string, data?: unknown) => pinoLogger.debug(withContext(data), message),
  info: (message: string, data?: unknown) => pinoLogger.info(withContext(data), message),
  warn: (message: string, data?: unknown) => pinoLogger.warn(withContext(data), message),
  error: (message: string, data?: unknown) => pinoLogger.error(withContext(data), message),
  raw: pinoLogger,
};
