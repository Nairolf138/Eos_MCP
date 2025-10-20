import { z } from 'zod';
import { createLogger } from '../server/logger.js';
import type { ToolDefinition, ToolMiddleware } from './types.js';

const inputSchema = {
  message: z.string().optional()
};

const logger = createLogger('tool:ping');

const loggingMiddleware: ToolMiddleware = async (context, next) => {
  logger.debug({ tool: context.name }, `[MCP] Execution du tool ${context.name}`);
  return next();
};

export const pingTool: ToolDefinition<typeof inputSchema> = {
  name: 'ping',
  config: {
    title: 'Ping tool',
    description: 'Retourne un message de confirmation.',
    inputSchema
  },
  handler: async (args) => {
    const response = args?.message ? `pong: ${args.message}` : 'pong';
    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  },
  middlewares: [loggingMiddleware]
};

export default pingTool;
