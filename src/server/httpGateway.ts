import type { AddressInfo } from 'node:net';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server } from 'node:http';
import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler
} from 'express';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { createLogger } from './logger';
import { ToolNotFoundError, type ToolRegistry } from './toolRegistry';

interface HttpGatewayOptions {
  port: number;
  host?: string;
  websocketPath?: string;
  security?: HttpGatewaySecurityOptions;
}

interface HttpGatewaySecurityOptions {
  apiKeys?: string[];
  mcpTokens?: string[];
  ipWhitelist?: string[];
  allowedOrigins?: string[];
  rateLimit?: RateLimitOptions;
  express?: ExpressSecurityMiddlewares;
}

interface ExpressSecurityMiddlewares {
  authentication?: RequestHandler;
  csrf?: RequestHandler;
  cors?: RequestHandler;
  throttling?: RequestHandler;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
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

  private readonly rateLimitState = new Map<string, { windowStart: number; count: number }>();

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

    this.applySecurityMiddlewares(app);

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

    wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      const securityValidation = this.validateWebSocketConnection(request);
      if (!securityValidation.ok) {
        const message = securityValidation.message ?? "Echec de l'authentification WebSocket";
        logger.warn({ reason: message }, 'Connexion WebSocket refusee');
        socket.send(
          JSON.stringify({
            type: 'error',
            error: { message }
          } satisfies InvokeErrorResponse)
        );
        socket.close(securityValidation.code ?? 1008, message);
        return;
      }

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

  private applySecurityMiddlewares(app: express.Express): void {
    const security = this.options.security;
    const expressSecurity = security?.express ?? {};

    const corsMiddleware = expressSecurity.cors ?? this.createCorsMiddleware();
    if (corsMiddleware) {
      app.use(corsMiddleware);
    }

    const authenticationMiddleware = expressSecurity.authentication ?? this.createAuthenticationMiddleware();
    if (authenticationMiddleware) {
      app.use(authenticationMiddleware);
    }

    const csrfMiddleware = expressSecurity.csrf ?? this.createCsrfMiddleware();
    if (csrfMiddleware) {
      app.use(csrfMiddleware);
    }

    const throttlingMiddleware = expressSecurity.throttling ?? this.createThrottlingMiddleware();
    if (throttlingMiddleware) {
      app.use(throttlingMiddleware);
    }
  }

  private createAuthenticationMiddleware(): RequestHandler | undefined {
    const security = this.options.security;
    const requiresAuthentication = Boolean(
      security &&
        ((security.apiKeys && security.apiKeys.length > 0) ||
          (security.mcpTokens && security.mcpTokens.length > 0) ||
          (security.ipWhitelist && security.ipWhitelist.length > 0))
    );

    if (!requiresAuthentication) {
      return undefined;
    }

    return (req, res, next) => {
      const ip = this.getClientIp(req);
      if (!ip || !this.isIpAllowed(ip)) {
        res.status(403).json({ error: "Adresse IP non autorisee" });
        return;
      }

      if (!this.hasValidCredentials(req.headers)) {
        res.status(401).json({ error: 'Authentification requise' });
        return;
      }

      next();
    };
  }

  private createCsrfMiddleware(): RequestHandler | undefined {
    const security = this.options.security;
    if (!security?.mcpTokens || security.mcpTokens.length === 0) {
      return undefined;
    }

    const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

    return (req, res, next) => {
      if (safeMethods.has(req.method.toUpperCase())) {
        next();
        return;
      }

      if (this.hasValidMcpToken(req.headers)) {
        next();
        return;
      }

      res.status(403).json({ error: 'Jeton MCP invalide ou manquant' });
    };
  }

  private createCorsMiddleware(): RequestHandler | undefined {
    const security = this.options.security;
    if (!security?.allowedOrigins || security.allowedOrigins.length === 0) {
      return undefined;
    }

    return (req, res, next) => {
      const origin = this.extractOrigin(req);
      const isAllowed = this.isOriginAllowed(origin);

      if (origin && isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }

      if (req.method.toUpperCase() === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-API-Key, X-MCP-Token, X-CSRF-Token'
        );

        if (origin && isAllowed) {
          res.status(204).end();
          return;
        }

        res.status(403).end();
        return;
      }

      if (origin && !isAllowed) {
        res.status(403).json({ error: "Origine non autorisee" });
        return;
      }

      next();
    };
  }

  private createThrottlingMiddleware(): RequestHandler | undefined {
    const rateLimit = this.options.security?.rateLimit;
    if (!rateLimit) {
      return undefined;
    }

    return (req, res, next) => {
      const ip = this.getClientIp(req);
      if (!ip) {
        res.status(429).json({ error: 'Limite de requetes atteinte' });
        return;
      }

      if (!this.consumeRateLimit(ip)) {
        res.status(429).json({ error: 'Limite de requetes atteinte' });
        return;
      }

      next();
    };
  }

  private extractOrigin(req: Request | IncomingMessage): string | undefined {
    const originHeader = 'headers' in req ? req.headers.origin : undefined;
    if (typeof originHeader === 'string') {
      return originHeader;
    }
    if (Array.isArray(originHeader)) {
      return originHeader[0];
    }
    return undefined;
  }

  private getClientIp(req: Request | IncomingMessage): string | undefined {
    const rawIp = 'ip' in req ? req.ip : req.socket.remoteAddress;
    if (!rawIp) {
      return undefined;
    }

    if (rawIp.startsWith('::ffff:')) {
      return rawIp.slice(7);
    }

    if (rawIp === '::1') {
      return '127.0.0.1';
    }

    return rawIp;
  }

  private isIpAllowed(ip: string): boolean {
    const whitelist = this.options.security?.ipWhitelist;
    if (!whitelist || whitelist.length === 0) {
      return true;
    }

    if (whitelist.includes('*')) {
      return true;
    }

    return whitelist.includes(ip) || whitelist.includes(`::ffff:${ip}`);
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    const origins = this.options.security?.allowedOrigins;
    if (!origins || origins.length === 0) {
      return true;
    }

    if (!origin) {
      return false;
    }

    if (origins.includes('*')) {
      return true;
    }

    return origins.some((allowed) => allowed.toLowerCase() === origin.toLowerCase());
  }

  private normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private extractBearerToken(authorizationHeader: string | undefined): string | undefined {
    if (!authorizationHeader) {
      return undefined;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (!token) {
      return undefined;
    }

    return scheme.toLowerCase() === 'bearer' ? token : undefined;
  }

  private hasValidApiKey(headers: IncomingHttpHeaders): boolean {
    const apiKeys = this.options.security?.apiKeys;
    if (!apiKeys || apiKeys.length === 0) {
      return false;
    }

    const headerValue = this.normalizeHeaderValue(headers['x-api-key']);
    if (!headerValue) {
      return false;
    }

    return apiKeys.includes(headerValue);
  }

  private hasValidMcpToken(headers: IncomingHttpHeaders): boolean {
    const mcpTokens = this.options.security?.mcpTokens;
    if (!mcpTokens || mcpTokens.length === 0) {
      return false;
    }

    const headerToken = this.normalizeHeaderValue(headers['x-mcp-token']);
    if (headerToken && mcpTokens.includes(headerToken)) {
      return true;
    }

    const bearerToken = this.extractBearerToken(this.normalizeHeaderValue(headers.authorization));
    if (bearerToken && mcpTokens.includes(bearerToken)) {
      return true;
    }

    return false;
  }

  private hasValidCredentials(headers: IncomingHttpHeaders): boolean {
    const security = this.options.security;
    if (!security) {
      return true;
    }

    const requiresApiKey = Boolean(security.apiKeys && security.apiKeys.length > 0);
    const requiresToken = Boolean(security.mcpTokens && security.mcpTokens.length > 0);

    if (!requiresApiKey && !requiresToken) {
      return true;
    }

    if (requiresApiKey && !this.hasValidApiKey(headers)) {
      return false;
    }

    if (requiresToken && !this.hasValidMcpToken(headers)) {
      return false;
    }

    return true;
  }

  private consumeRateLimit(ip: string): boolean {
    const rateLimit = this.options.security?.rateLimit;
    if (!rateLimit) {
      return true;
    }

    const now = Date.now();
    const state = this.rateLimitState.get(ip);

    if (!state || now - state.windowStart >= rateLimit.windowMs) {
      this.rateLimitState.set(ip, { windowStart: now, count: 1 });
      return true;
    }

    if (state.count >= rateLimit.max) {
      return false;
    }

    state.count += 1;
    this.rateLimitState.set(ip, state);
    return true;
  }

  private validateWebSocketConnection(
    request: IncomingMessage
  ): { ok: boolean; code?: number; message?: string } {
    const security = this.options.security;
    if (!security) {
      return { ok: true };
    }

    const ip = this.getClientIp(request);
    if (!ip || !this.isIpAllowed(ip)) {
      return { ok: false, code: 1008, message: "Adresse IP non autorisee" };
    }

    const origin = this.extractOrigin(request);
    if (!this.isOriginAllowed(origin)) {
      return { ok: false, code: 1008, message: "Origine non autorisee" };
    }

    if (!this.hasValidCredentials(request.headers)) {
      return { ok: false, code: 1008, message: 'Authentification requise' };
    }

    if (!this.consumeRateLimit(ip)) {
      return { ok: false, code: 1013, message: 'Limite de requetes atteinte' };
    }

    return { ok: true };
  }
}

function createHttpGateway(registry: ToolRegistry, options: HttpGatewayOptions): HttpGateway {
  return new HttpGateway(registry, options);
}

export { createHttpGateway, HttpGateway };
