import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino, { stdTimeFunctions, type Logger } from 'pino';
import { config } from '../config/index.js';

const logFilePath = config.logging.filePath;
mkdirSync(dirname(logFilePath), { recursive: true });

const baseLogger: Logger = pino(
  {
    level: config.logging.level,
    base: undefined,
    timestamp: stdTimeFunctions.isoTime
  },
  pino.destination({ dest: logFilePath, sync: true })
);

export function getLogger(): Logger {
  return baseLogger;
}

export function createLogger(scope: string): Logger {
  return baseLogger.child({ scope });
}

export type { Logger };
