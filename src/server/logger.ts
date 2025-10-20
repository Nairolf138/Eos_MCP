import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pino, { stdTimeFunctions, type Logger } from 'pino';

const DEFAULT_LOG_FILE = 'logs/mcp-server.log';

const logFilePath = resolve(process.cwd(), process.env.MCP_LOG_FILE ?? DEFAULT_LOG_FILE);
mkdirSync(dirname(logFilePath), { recursive: true });

const baseLogger: Logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
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
