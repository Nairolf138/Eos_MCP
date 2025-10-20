import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { createLogger } from './logger.js';
import { ToolNotFoundError, type ToolRegistry } from './toolRegistry.js';

interface HttpGatewayOptions {
  port: number;
  host?: string;
  websocketPath?: string;
}

interface InvokeRequestPayload {
  id?: string;
  tool: string;
  args?: unknown;
  extra?: unknown;
}

interface InvokeSuccessResponse {
  type: 'result';
  id?: string;
  tool: string;
  result: unknown;
}

interface InvokeErrorResponse {
  type: 'error';
  id?: string;
  tool?: string;
  error: { message: string };
}

const logger = createLogger('http-gateway');

class HttpGateway {
  private server?: Server;

  private wss?: WebSocketServer;

  private started = false;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly options: HttpGatewayOptions
  ) {}

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const app = express();
    app.use(express.json());

    app.post('/tools/:name', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const toolName = req.params.name;
        const body = req.body;
        const isObjectPayload = typeof body === 'object' && body !== null;
        const args = isObjectPayload && 'args' in (body as Record<string, unknown>) ? (body as { args?: unknown }).args : body;
        const extra = isObjectPayload && 'extra' in (body as Record<string, unknown>) ? (body as { extra?: unknown }).extra : undefined;
        const result = await this.registry.invoke(toolName, args, extra);
        res.json({ tool: toolName, result });
      } catch (error) {
        next(error);
      }
    });

    app.use(this.createErrorHandler());

    const server = createServer(app);
    const wss = new WebSocketServer({
      server,
      path: this.options.websocketPath ?? '/ws'
    });

    wss.on('connection', (socket: WebSocket) => {
      socket.on('error', (error: Error) => {
        logger.error({ error }, 'Erreur socket WebSocket');
      });

      socket.on('message', async (rawMessage: RawData) => {
        const messageText =
          typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf-8');
        let payload: InvokeRequestPayload | undefined;
        try {
          payload = JSON.parse(messageText) as InvokeRequestPayload;
        } catch (error) {
          logger.warn({ error }, 'Message WebSocket invalide: %s', messageText);
          socket.send(
            JSON.stringify({
              type: 'error',
              error: { message: 'Payload JSON invalide' }
            } satisfies InvokeErrorResponse)
          );
          return;
        }

        if (!payload.tool) {
          socket.send(
            JSON.stringify({
              type: 'error',
              id: payload.id,
              error: { message: 'Champ "tool" manquant' }
            } satisfies InvokeErrorResponse)
          );
          return;
        }

        try {
          const result = await this.registry.invoke(payload.tool, payload.args, payload.extra);
          const response: InvokeSuccessResponse = {
            type: 'result',
            id: payload.id,
            tool: payload.tool,
            result
          };
          socket.send(JSON.stringify(response));
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Erreur inconnue');
          const response: InvokeErrorResponse = {
            type: 'error',
            id: payload.id,
            tool: payload.tool,
            error: { message: err.message }
          };
          socket.send(JSON.stringify(response));
        }
      });

      socket.send(JSON.stringify({ type: 'ready' }));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port, this.options.host ?? '0.0.0.0', () => {
        server.off('error', reject);
        this.started = true;
        this.server = server;
        this.wss = wss;
        logger.info({ address: this.getAddress() }, 'Passerelle HTTP/WS demarree');
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    const closeWebSocket = async (): Promise<void> => {
      if (!this.wss) {
        return;
      }
      const clients = Array.from(this.wss.clients);
      clients.forEach((client) => {
        try {
          client.close();
        } catch (error) {
          logger.warn({ error }, "Erreur lors de la fermeture d'une connexion WebSocket");
        }
      });

      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
    };

    await closeWebSocket();

    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.started = false;
    this.server = undefined;
    this.wss = undefined;
  }

  public getAddress(): AddressInfo | undefined {
    const address = this.server?.address();
    if (!address || typeof address === 'string') {
      return undefined;
    }
    return address;
  }

  private createErrorHandler() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
      const err = error instanceof Error ? error : new Error('Erreur inconnue');
      logger.error({ error: err }, "Erreur HTTP lors de l'appel d'un outil");
      const status = err instanceof ToolNotFoundError ? 404 : 500;
      res.status(status).json({
        error: err.message
      });
    };
  }
}

function createHttpGateway(registry: ToolRegistry, options: HttpGatewayOptions): HttpGateway {
  return new HttpGateway(registry, options);
}

export { createHttpGateway, HttpGateway };
