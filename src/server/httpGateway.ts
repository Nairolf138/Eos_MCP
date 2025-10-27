import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingHttpHeaders,
  type Server
} from 'node:http';
import { randomUUID } from 'node:crypto';
import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
  type ErrorRequestHandler,
  Router
} from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ErrorCode as JsonRpcErrorCode, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from './logger';
import type {
  OscConnectionStateProvider,
  OscConnectionOverview,
  OscDiagnostics
} from '../services/osc/index';
import { getToolJsonSchema, toolJsonSchemas } from '../schemas/index';
import type { ToolRegistry } from './toolRegistry';

interface StdioStatusSnapshot {
  status: 'starting' | 'listening' | 'stopped';
  clients: number;
  startedAt?: number;
}

interface HttpGatewayOptions {
  port: number;
  host?: string;
  publicUrl?: string;
  serverFactory: () => McpServer;
  security?: HttpGatewaySecurityOptions;
  oscConnectionProvider?: OscConnectionStateProvider;
  oscGateway?: { getDiagnostics: () => OscDiagnostics };
  stdioStatusProvider?: () => StdioStatusSnapshot | undefined;
}

interface HttpGatewaySecurityOptions {
  apiKeys?: readonly string[];
  mcpTokens?: readonly string[];
  ipAllowlist?: readonly string[];
  allowedOrigins?: readonly string[];
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

const logger = createLogger('http-gateway');
const manifestPath = path.resolve(process.cwd(), 'manifest.json');
const HTTP_PUBLIC_URL_PLACEHOLDER = 'http://{HOST}:{PORT}';

interface ManifestTransport {
  type?: string;
  url?: string;
  readonly [key: string]: unknown;
}

interface ManifestServerDefinition {
  server?: {
    transport?: ManifestTransport;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface ManifestDocument {
  mcp?: {
    servers?: ManifestServerDefinition[];
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

interface SessionRecord {
  id: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastActivityAt: number;
  closed: boolean;
}

type JsonRpcId = string | number | null;

class HttpGateway {
  private server?: Server;

  private started = false;

  private startTimestamp?: number;

  private manifestTemplate?: ManifestDocument;

  private readonly rateLimitState = new Map<string, { windowStart: number; count: number }>();

  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly registry: ToolRegistry,
    private readonly options: HttpGatewayOptions
  ) {
    this.oscConnectionProvider = options.oscConnectionProvider;
    this.oscGateway = options.oscGateway;
    this.stdioStatusProvider = options.stdioStatusProvider;
  }

  private readonly oscConnectionProvider?: OscConnectionStateProvider;

  private readonly oscGateway?: { getDiagnostics: () => OscDiagnostics };

  private readonly stdioStatusProvider?: () => StdioStatusSnapshot | undefined;

  private async loadManifestTemplate(): Promise<void> {
    if (this.manifestTemplate) {
      return;
    }

    try {
      const raw = await readFile(manifestPath, 'utf8');
      this.manifestTemplate = JSON.parse(raw) as ManifestDocument;
    } catch (error) {
      logger.error({ err: error }, 'Impossible de charger le manifest MCP.');
      throw error;
    }
  }

  private buildManifestResponse(req: Request): ManifestDocument {
    if (!this.manifestTemplate) {
      throw new Error('Manifest MCP non initialise');
    }

    const manifest = JSON.parse(JSON.stringify(this.manifestTemplate)) as ManifestDocument;
    const resolvedPublicUrl = this.resolvePublicUrl(req);
    const parsedPublicUrl = new URL(resolvedPublicUrl);
    const pathPrefix = parsedPublicUrl.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
    const normalizedPublicUrl = `${parsedPublicUrl.origin}${pathPrefix ? `/${pathPrefix}/` : '/'}`;

    const normalizeStringValue = (raw: string): string => {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        return trimmed;
      }

      if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) || trimmed.startsWith('//')) {
        return trimmed;
      }

      let normalized = trimmed.replace(/^\/+/, '');

      if (pathPrefix) {
        const prefixWithSlash = `${pathPrefix}/`;
        if (normalized === pathPrefix) {
          normalized = '';
        } else if (normalized.startsWith(prefixWithSlash)) {
          normalized = normalized.slice(prefixWithSlash.length);
        }
      }

      return normalized;
    };

    const normalizeValue = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return normalizeStringValue(value);
      }

      if (Array.isArray(value)) {
        return value.map((entry) => (typeof entry === 'string' ? normalizeStringValue(entry) : entry));
      }

      return value;
    };

    const mcp = manifest.mcp;
    if (mcp) {
      const updatedMcp = { ...mcp };
      const servers = mcp.servers;
      if (Array.isArray(servers)) {
        updatedMcp.servers = servers.map((definition) => {
          if (!definition.server) {
            return { ...definition };
          }

          const transport = definition.server.transport;
          const normalizedTransport =
            transport && typeof transport === 'object'
              ? transport.type && transport.type !== 'http'
                ? { ...transport }
                : {
                    ...transport,
                    url: this.resolveTransportUrl(transport.url, normalizedPublicUrl)
                  }
              : undefined;

          const endpoints = definition.server.endpoints as Record<string, unknown> | undefined;
          const normalizedEndpoints =
            endpoints && typeof endpoints === 'object'
              ? Object.fromEntries(
                  Object.entries(endpoints).map(([key, value]) => [key, normalizeValue(value)])
                )
              : undefined;

          return {
            ...definition,
            server: {
              ...definition.server,
              ...(transport ? { transport: normalizedTransport } : {}),
              ...(endpoints ? { endpoints: normalizedEndpoints } : {})
            }
          };
        });
      }

      const capabilities = mcp.capabilities;
      if (capabilities && typeof capabilities === 'object') {
        const capabilitiesRecord = capabilities as Record<string, unknown>;
        const updatedCapabilities = { ...capabilitiesRecord };
        const tools = capabilitiesRecord.tools;

        if (tools && typeof tools === 'object') {
          const normalizedTools = { ...(tools as Record<string, unknown>) };

          const listEndpoint = normalizedTools.list_endpoint;
          if (typeof listEndpoint === 'string') {
            normalizedTools.list_endpoint = normalizeStringValue(listEndpoint);
          }

          const schemaCatalogs = normalizedTools.schema_catalogs;
          if (Array.isArray(schemaCatalogs)) {
            normalizedTools.schema_catalogs = schemaCatalogs.map((entry) =>
              typeof entry === 'string' ? normalizeStringValue(entry) : entry
            );
          }

          const schemaBasePath = normalizedTools.schema_base_path;
          if (typeof schemaBasePath === 'string') {
            normalizedTools.schema_base_path = normalizeStringValue(schemaBasePath);
          }

          updatedCapabilities.tools = normalizedTools as typeof tools;
        }

        updatedMcp.capabilities = updatedCapabilities as typeof capabilities;
      }

      const schemas = mcp.schemas as Record<string, unknown> | undefined;
      if (schemas && typeof schemas === 'object') {
        updatedMcp.schemas = Object.fromEntries(
          Object.entries(schemas).map(([key, value]) => [key, normalizeValue(value)])
        ) as typeof schemas;
      }

      updatedMcp.servers = updatedMcp.servers ?? mcp.servers;
      manifest.mcp = updatedMcp;
    }

    return manifest;
  }

  private resolveTransportUrl(rawUrl: unknown, fallbackUrl: string): string {
    if (typeof rawUrl !== 'string') {
      return fallbackUrl;
    }

    const trimmed = rawUrl.trim();
    if (trimmed.length === 0) {
      return fallbackUrl;
    }

    if (this.isTransportPlaceholder(trimmed)) {
      return fallbackUrl;
    }

    const normalized = this.normalizeHttpUrl(trimmed);
    if (!normalized) {
      return fallbackUrl;
    }

    return normalized;
  }

  private isTransportPlaceholder(url: string): boolean {
    return url === HTTP_PUBLIC_URL_PLACEHOLDER;
  }

  private normalizeHttpUrl(rawUrl: string): string | undefined {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined;
      }

      const sanitizedPath = parsed.pathname.replace(/\/+$/, '');
      const normalizedPath = sanitizedPath.length > 0 ? `${sanitizedPath}/` : '/';
      return `${parsed.origin}${normalizedPath}${parsed.search}${parsed.hash}`;
    } catch (_error) {
      return undefined;
    }
  }

  private resolvePublicUrl(req: Request): string {
    const configured = this.options.publicUrl?.trim();
    if (configured && configured.length > 0) {
      return configured;
    }

    const forwardedProtoHeader = req.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
      ? forwardedProtoHeader[0]
      : forwardedProtoHeader?.split(',')[0];
    const protocol = forwardedProto?.trim().toLowerCase() || req.protocol || 'http';

    const forwardedHostHeader = req.headers['x-forwarded-host'];
    const forwardedHost = Array.isArray(forwardedHostHeader)
      ? forwardedHostHeader[0]
      : forwardedHostHeader?.split(',')[0];
    const host = forwardedHost?.trim() || req.get('host');

    if (!host) {
      throw new Error(
        "Impossible de determiner l'URL publique du serveur MCP. Definissez MCP_HTTP_PUBLIC_URL ou configurez correctement le proxy."
      );
    }

    return `${protocol}://${host}`;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.loadManifestTemplate();

    const app = express();

    this.applySecurityMiddlewares(app);

    app.get('/manifest.json', (req: Request, res: Response, next: NextFunction) => {
      try {
        const manifest = this.buildManifestResponse(req);
        res.type('application/json');
        res.send(JSON.stringify(manifest, null, 2));
      } catch (error) {
        next(error);
      }
    });

    app.get('/schemas/tools/index.json', (_req: Request, res: Response) => {
      const tools = toolJsonSchemas.map((schema) => ({
        name: schema.name,
        title: schema.title ?? schema.name,
        description: schema.description,
        uri: schema.uri,
        schemaUrl: `/schemas/tools/${schema.name}.json`
      }));

      res.json({ tools });
    });

    app.get('/schemas/tools/:toolName.json', (req: Request, res: Response, next: NextFunction) => {
      const schema = getToolJsonSchema(req.params.toolName);
      if (!schema) {
        res.status(404).json({ error: `Schema for tool '${req.params.toolName}' introuvable.` });
        return;
      }

      try {
        res.type('application/schema+json');
        res.send(JSON.stringify(schema.schema, null, 2));
      } catch (error) {
        next(error);
      }
    });

    app.get('/health', (_req: Request, res: Response) => {
      const now = Date.now();
      const uptimeMs = this.startTimestamp ? now - this.startTimestamp : 0;
      const toolCount = this.registry.listTools().length;
      const oscOverview = this.getOscOverview();
      const oscDiagnostics = this.getOscDiagnosticsSnapshot();

      let status: 'starting' | 'ok' | 'degraded' | 'offline';
      if (!this.started) {
        status = 'starting';
      } else if (oscOverview) {
        status = this.mapOscHealthToStatus(oscOverview.health);
      } else {
        status = 'ok';
      }

      const payload: Record<string, unknown> = {
        status,
        uptimeMs,
        toolCount,
        transportActive: this.started
      };

      payload.mcp = this.buildMcpStatus(now);

      const oscPayload = this.buildOscStatus(oscOverview, oscDiagnostics);
      if (oscPayload) {
        payload.osc = oscPayload;
      }

      res.json(payload);
    });

    app.get('/tools', (_req: Request, res: Response) => {
      const tools = this.registry.getRegisteredSummaries();
      res.json({ tools });
    });

    const mcpRouter = Router();
    mcpRouter.use(express.json({ limit: '4mb' }));
    mcpRouter.use(this.createJsonParseErrorHandler());
    mcpRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.handleMcpPost(req, res);
      } catch (error) {
        next(error);
      }
    });
    mcpRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.handleMcpStream(req, res);
      } catch (error) {
        next(error);
      }
    });
    mcpRouter.delete('/', async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.handleMcpStream(req, res);
      } catch (error) {
        next(error);
      }
    });
    app.use('/mcp', mcpRouter);

    app.use(this.createErrorHandler());

    const server = createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port, this.options.host ?? '0.0.0.0', () => {
        server.off('error', reject);
        this.started = true;
        this.startTimestamp = Date.now();
        this.server = server;
        logger.info({ address: this.getAddress() }, 'Passerelle HTTP MCP demarree');
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((sessionId) => this.finalizeSession(sessionId).catch(() => undefined)));

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
    this.startTimestamp = undefined;
  }

  public getAddress(): AddressInfo | undefined {
    const address = this.server?.address();
    if (!address || typeof address === 'string') {
      return undefined;
    }

    return address;
  }

  private buildMcpStatus(now: number): Record<string, unknown> {
    const lastActivity = Array.from(this.sessions.values()).reduce<number | null>((acc, session) => {
      const candidate = session.lastActivityAt;
      if (acc === null) {
        return candidate;
      }
      return Math.max(acc, candidate);
    }, null);

    const stdioStatus = this.getStdioStatus(now);

    return {
      http: {
        status: this.started ? 'listening' : 'stopped',
        sessionCount: this.sessions.size,
        startedAt: this.startTimestamp ?? null,
        lastActivityAt: lastActivity
      },
      ...(stdioStatus ? { stdio: stdioStatus } : {})
    };
  }

  private buildOscStatus(
    overview: OscConnectionOverview | undefined,
    diagnostics: OscDiagnostics | undefined
  ): Record<string, unknown> | undefined {
    if (!overview) {
      return undefined;
    }

    const transports = overview.transports;
    const status = overview.health;
    const payload: Record<string, unknown> = {
      status,
      transports,
      updatedAt: overview.updatedAt
    };

    if (diagnostics) {
      payload.diagnostics = diagnostics;
    }

    return payload;
  }

  private mapOscHealthToStatus(
    health: OscConnectionOverview['health']
  ): 'starting' | 'ok' | 'degraded' | 'offline' {
    switch (health) {
      case 'online':
        return 'ok';
      case 'degraded':
        return 'degraded';
      case 'offline':
      default:
        return 'offline';
    }
  }

  private getOscOverview(): OscConnectionOverview | undefined {
    return this.oscConnectionProvider?.getOverview();
  }

  private getOscDiagnosticsSnapshot(): OscDiagnostics | undefined {
    try {
      return this.oscGateway?.getDiagnostics();
    } catch (error) {
      logger.warn({ error }, 'Impossible de recuperer les diagnostics OSC');
      return undefined;
    }
  }

  private getStdioStatus(now: number): Record<string, unknown> | undefined {
    if (!this.stdioStatusProvider) {
      return undefined;
    }

    const snapshot = this.stdioStatusProvider();
    if (!snapshot) {
      return undefined;
    }

    const startedAt = snapshot.startedAt ?? null;
    const uptimeMs = startedAt ? Math.max(0, now - startedAt) : 0;

    return {
      status: snapshot.status,
      clients: snapshot.clients,
      startedAt,
      uptimeMs
    };
  }

  private createJsonParseErrorHandler(): ErrorRequestHandler {
    return (error, _req, res, next) => {
      if (error instanceof SyntaxError) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: JsonRpcErrorCode.ParseError,
            message: 'Parse error'
          },
          id: null
        });
        return;
      }
      next(error);
    };
  }

  private async handleMcpPost(req: Request, res: Response): Promise<void> {
    const body = req.body;
    const requestId = this.getJsonRpcRequestId(body);
    const sessionId = this.normalizeHeaderValue(req.headers['mcp-session-id']);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        this.sendJsonRpcError(res, JsonRpcErrorCode.ConnectionClosed, 'Session inconnue', 404, requestId);
        return;
      }

      session.lastActivityAt = Date.now();
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      this.sendJsonRpcError(
        res,
        JsonRpcErrorCode.InvalidRequest,
        'Requete initialise invalide : envoyez un appel "initialize" sans Mcp-Session-Id',
        undefined,
        requestId
      );
      return;
    }

    const sessionRecord = await this.createSession();
    let initializationSucceeded = false;
    try {
      await sessionRecord.transport.handleRequest(req, res, body);
      initializationSucceeded = sessionRecord.id.length > 0;
    } finally {
      if (!initializationSucceeded) {
        await this.disposeEphemeralSession(sessionRecord);
      }
    }
  }

  private async handleMcpStream(req: Request, res: Response): Promise<void> {
    const sessionId = this.normalizeHeaderValue(req.headers['mcp-session-id']);
    if (!sessionId) {
      this.sendJsonRpcError(
        res,
        JsonRpcErrorCode.InvalidRequest,
        'En-tete Mcp-Session-Id requis pour cette requete'
      );
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendJsonRpcError(res, JsonRpcErrorCode.ConnectionClosed, 'Session inconnue', 404);
      return;
    }

    session.lastActivityAt = Date.now();
    await session.transport.handleRequest(req, res);
  }

  private async createSession(): Promise<SessionRecord> {
    const server = this.options.serverFactory();

    const record: SessionRecord = {
      id: '',
      server,
      transport: undefined as unknown as StreamableHTTPServerTransport,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      closed: false
    };

    const allowedOrigins = this.options.security?.allowedOrigins;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: async (sessionId) => {
        record.id = sessionId;
        record.lastActivityAt = Date.now();
        this.sessions.set(sessionId, record);
      },
      onsessionclosed: async (sessionId) => {
        if (sessionId) {
          this.sessions.delete(sessionId);
        }
        await this.closeServer(record);
      },
      allowedOrigins: allowedOrigins ? Array.from(allowedOrigins) : undefined
    });

    record.transport = transport;

    try {
      await server.connect(transport);
    } catch (error) {
      await this.closeServer(record);
      throw error;
    }

    return record;
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    this.sessions.delete(sessionId);
    try {
      await record.transport.close();
    } catch (error) {
      logger.warn({ error }, 'Erreur lors de la fermeture du transport HTTP MCP');
    }
    await this.closeServer(record);
  }

  private async disposeEphemeralSession(record: SessionRecord): Promise<void> {
    if (record.id && this.sessions.has(record.id)) {
      await this.finalizeSession(record.id);
      return;
    }

    try {
      await record.transport.close();
    } catch (error) {
      logger.warn({ error }, 'Erreur lors de la fermeture du transport HTTP MCP');
    }
    await this.closeServer(record);
  }

  private async closeServer(record: SessionRecord): Promise<void> {
    if (record.closed) {
      return;
    }

    record.closed = true;

    try {
      await record.server.close();
    } catch (error) {
      logger.warn({ error }, 'Erreur lors de la fermeture du serveur MCP de session');
    }
  }

  private sendJsonRpcError(
    res: Response,
    code: number,
    message: string,
    status?: number,
    id?: JsonRpcId
  ): void {
    res.status(status ?? 400).json({
      jsonrpc: '2.0',
      error: {
        code,
        message
      },
      id: id ?? null
    });
  }

  private getJsonRpcRequestId(payload: unknown): JsonRpcId | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const candidate = (payload as { id?: unknown }).id;
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'number') {
      return candidate;
    }

    return undefined;
  }

  private createErrorHandler() {
    return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
      const err = error instanceof Error ? error : new Error('Erreur inconnue');
      logger.error({ error: err }, 'Erreur HTTP');

      if (req.path.startsWith('/mcp')) {
        this.sendJsonRpcError(res, JsonRpcErrorCode.InternalError, 'Internal server error', 500);
        return;
      }

      res.status(500).json({
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
          security.ipAllowlist !== undefined)
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
    if (security?.allowedOrigins === undefined) {
      return undefined;
    }

    return (req, res, next) => {
      const origin = this.extractOrigin(req);
      const isAllowed = this.isOriginAllowed(origin);

      if (origin && isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        res.setHeader('Vary', 'Origin');
      }

      if (req.method.toUpperCase() === 'OPTIONS') {
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-API-Key, X-MCP-Token, X-CSRF-Token, Mcp-Session-Id, Mcp-Protocol-Version'
        );

        if ((origin && isAllowed) || (!origin && this.isOriginAllowed(undefined))) {
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
    const allowlist = this.options.security?.ipAllowlist;
    if (allowlist === undefined) {
      return true;
    }

    if (allowlist.length === 0) {
      return true;
    }

    if (allowlist.includes('*')) {
      return true;
    }

    return allowlist.includes(ip) || allowlist.includes(`::ffff:${ip}`);
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    const origins = this.options.security?.allowedOrigins;
    if (origins === undefined) {
      return true;
    }

    if (origins.length === 0) {
      return origin === undefined;
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
}

function createHttpGateway(registry: ToolRegistry, options: HttpGatewayOptions): HttpGateway {
  return new HttpGateway(registry, options);
}

export { createHttpGateway, HttpGateway };
