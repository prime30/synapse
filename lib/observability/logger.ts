/**
 * Structured logger built on Pino -- EPIC B
 *
 * Pretty-print in development, JSON in production.
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isEnabled = process.env.ENABLE_OBSERVABILITY !== 'false';
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

const baseLogger = pino({
  level: isEnabled ? logLevel : 'silent',
  ...(isProduction
    ? {
        formatters: { level: (label: string) => ({ level: label }) },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export const logger = baseLogger;

export function createModuleLogger(module: string) {
  return logger.child({ module });
}