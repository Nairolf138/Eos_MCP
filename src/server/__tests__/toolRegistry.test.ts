import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDefinition, ToolExecutionResult, ToolMiddleware } from '../../tools/types';
import {
  sessionGetCurrentUserTool,
  setCurrentUserId,
  clearCurrentUserId
} from '../../tools/session/index';

jest.mock('../logger.js', () => ({
  __esModule: true,
  ...(() => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn()
    };
    logger.child.mockReturnValue(logger);
    return {
      createLogger: jest.fn(() => logger),
      __mockLogger: logger
    };
  })()
}));

import { ToolRegistry } from '../toolRegistry';

const { __mockLogger: mockLogger } = jest.requireMock('../logger.js') as {
  __mockLogger: {
    info: jest.Mock;
    warn: jest.Mock;
  };
};

const createMockServer = (): McpServer & {
  registerTool: jest.Mock;
  sendToolListChanged: jest.Mock;
} => {
  const registerTool = jest.fn();
  const sendToolListChanged = jest.fn();

  return {
    registerTool,
    sendToolListChanged
  } as unknown as McpServer & {
    registerTool: jest.Mock;
    sendToolListChanged: jest.Mock;
  };
};

describe('ToolRegistry schema-less tools', () => {
  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
  });

  it('invokes handlers with undefined args while preserving extra', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const handler = jest.fn(async (_args, extra): Promise<ToolExecutionResult> => {
      return {
        content: [
          {
            type: 'text',
            text: `extra:${JSON.stringify(extra)}`
          }
        ]
      };
    });

    const tool: ToolDefinition = {
      name: 'no_schema_tool',
      config: {
        description: 'A tool without an input schema'
      },
      handler
    };

    registry.register(tool);

    expect(server.registerTool).toHaveBeenCalledTimes(1);
    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    const extra = { requestId: 'without-schema' };
    const result = await (registeredHandler as RegisteredTestHandler)(extra);

    expect(handler).toHaveBeenCalledWith(undefined, extra);
    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: 'extra:{"requestId":"without-schema"}'
    });
  });

  it('provides middlewares with normalised args/extra', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);
    const contexts: Array<{ args: unknown; extra: unknown }> = [];

    const middleware: ToolMiddleware = async (context, next) => {
      contexts.push({ args: context.args, extra: context.extra });
      return next();
    };

    const handler = jest.fn(async (_args, _extra): Promise<ToolExecutionResult> => ({
      content: [{ type: 'text', text: 'middleware' }]
    }));

    const tool: ToolDefinition = {
      name: 'no_schema_with_middleware',
      config: {
        description: 'Schema-less tool using middlewares'
      },
      handler,
      middlewares: [middleware]
    };

    registry.register(tool);

    const [, , registeredHandler] = server.registerTool.mock.calls[0];
    const extra = { requestId: 'middleware-test' };
    await (registeredHandler as RegisteredTestHandler)(extra);

    expect(contexts).toEqual([
      {
        args: undefined,
        extra
      }
    ]);
    expect(handler).toHaveBeenCalledWith(undefined, extra);
  });



  it('executes a tool without prior manual or schema consultation', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const handler = jest.fn(async (_args, _extra): Promise<ToolExecutionResult> => ({
      content: [{ type: 'text', text: 'ok' }]
    }));

    const tool: ToolDefinition = {
      name: 'execution_without_consultation',
      config: {
        description: 'Tool that should run immediately'
      },
      handler
    };

    registry.register(tool);

    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    let caughtError: unknown;
    const extra = { requestId: 'no-preread' };

    try {
      await (registeredHandler as RegisteredTestHandler)(extra);
    } catch (error) {
      caughtError = error;
    }

    expect(handler).toHaveBeenCalledWith(undefined, extra);
    expect(caughtError).toBeUndefined();

    const errorMessage =
      caughtError instanceof Error ? caughtError.message : String(caughtError ?? '');
    expect(errorMessage).not.toContain("Consultation requise avant d'utiliser l'outil");
  });


  it('enregistre eos_capabilities_get en premiere position via registerMany', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const createTool = (name: string): ToolDefinition => ({
      name,
      config: { description: name },
      handler: async () => ({ content: [{ type: 'text', text: name }] })
    });

    registry.registerMany([
      createTool('eos_cue_go'),
      createTool('eos_capabilities_get'),
      createTool('session_get_current_user')
    ]);

    expect(server.registerTool).toHaveBeenCalledTimes(3);
    expect(server.registerTool.mock.calls[0]?.[0]).toBe('eos_capabilities_get');
  });

  it('executes session_get_current_user successfully', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const handler = jest.fn(sessionGetCurrentUserTool.handler);

    registry.register({
      ...sessionGetCurrentUserTool,
      handler
    });

    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    setCurrentUserId(42);
    const extra = { requestId: 'session-tool' };
    const result = await (registeredHandler as RegisteredTestHandler)(extra);

    expect(handler).toHaveBeenCalledWith(undefined, extra);
    expect(result.structuredContent).toMatchObject({ user: 42 });
    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: 'Utilisateur courant: 42'
    });
    clearCurrentUserId();
  });

  it('journalise les champs minimaux d\'audit en succes', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    const tool: ToolDefinition = {
      name: 'audit_tool',
      config: {
        inputSchema: {
          command: z.string(),
          require_confirmation: z.boolean().optional(),
          safety_level: z.enum(['strict', 'standard', 'off']).optional(),
          user: z.number().optional(),
          targetAddress: z.string().optional(),
          targetPort: z.number().optional(),
          apiKey: z.string().optional()
        }
      },
      handler: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: { token: 'secret-value' }
      })
    };

    registry.register(tool);
    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    await (registeredHandler as RegisteredTestHandler)(
      {
        command: 'Record Cue 1',
        require_confirmation: true,
        safety_level: 'off',
        user: 7,
        targetAddress: '10.0.0.2',
        targetPort: 3032,
        apiKey: '123'
      },
      { sessionId: 'session-42', requestId: 'req-42' }
    );

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.info.mock.calls[0] as [Record<string, unknown>];

    expect(payload.event).toBe('tool_execution_audit');
    expect(payload.toolName).toBe('audit_tool');
    expect(payload.correlationId).toBe('req-42');
    expect(payload.sessionId).toBe('session-42');
    expect(payload.userId).toBe(7);
    expect(payload.durationMs).toEqual(expect.any(Number));
    expect(payload.sensitiveAction).toBe(true);
    expect(payload.safetyMode).toBe('off');
    expect(payload.targetConsole).toEqual({ address: '10.0.0.2', port: 3032 });
    expect(payload.args).toMatchObject({ apiKey: '[REDACTED]' });
    expect(payload.result).toMatchObject({ structuredContent: { token: '[REDACTED]' } });
  });

  it('journalise les champs minimaux d\'audit en erreur', async () => {
    const server = createMockServer();
    const registry = new ToolRegistry(server);

    registry.register({
      name: 'audit_failure_tool',
      config: { inputSchema: { command: z.string() } },
      handler: async () => {
        throw new Error('boom');
      }
    });

    const [, , registeredHandler] = server.registerTool.mock.calls[0];

    await expect(
      (registeredHandler as RegisteredTestHandler)(
        { command: 'Delete Cue 1' },
        { sessionId: 'session-err', requestId: 'req-err' }
      )
    ).rejects.toThrow('boom');

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.warn.mock.calls[0] as [Record<string, unknown>];
    expect(payload.event).toBe('tool_execution_audit');
    expect(payload.status).toBe('error');
    expect(payload.correlationId).toBe('req-err');
    expect(payload.result).toMatchObject({ message: 'boom', name: 'Error' });
    expect(payload.durationMs).toEqual(expect.any(Number));
  });
});

type RegisteredTestHandler = (first: unknown, second?: unknown) => Promise<ToolExecutionResult>;
