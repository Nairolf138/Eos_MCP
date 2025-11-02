import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const MANUAL_FILENAME = 'eos_serie.pdf';
const MANUAL_RESOURCE_ID = 'eos-manual';
const MANUAL_URI = 'manual://eos';
const MANUAL_TITLE = 'Manuel Eos';
const MANUAL_MIME_TYPE = 'application/pdf';

type ManualSectionExtractor = (manual: Buffer) => Promise<Buffer> | Buffer;

interface ManualSection {
  id: string;
  uri: string;
  title: string;
  description?: string;
  pageRange?: { start: number; end?: number };
  extractContent?: ManualSectionExtractor;
}

const manualSections: readonly ManualSection[] = [];

let cachedManual: { buffer: Buffer; filePath: string } | undefined;

async function loadManualBuffer(): Promise<{ buffer: Buffer; filePath: string }> {
  if (cachedManual) {
    return { buffer: Buffer.from(cachedManual.buffer), filePath: cachedManual.filePath };
  }

  const candidates = [
    path.resolve(process.cwd(), 'docs', MANUAL_FILENAME),
    path.resolve(__dirname, '../../docs', MANUAL_FILENAME),
    path.resolve(__dirname, '../../../docs', MANUAL_FILENAME)
  ];

  const attempted: string[] = [];
  const errors: Array<{ path: string; error: unknown }> = [];

  for (const candidate of candidates) {
    if (attempted.includes(candidate)) {
      continue;
    }
    attempted.push(candidate);

    try {
      const buffer = await readFile(candidate);
      cachedManual = { buffer, filePath: candidate };
      return { buffer: Buffer.from(buffer), filePath: candidate };
    } catch (error: unknown) {
      errors.push({ path: candidate, error });
    }
  }

  const uniqueAttempts = Array.from(new Set(attempted));
  const details = errors
    .map(({ path: candidatePath, error }) => {
      const reason = error instanceof Error ? error.message : String(error);
      return `- ${candidatePath}: ${reason}`;
    })
    .join('\n');

  const message =
    `Impossible de charger le manuel EOS (fichier ${MANUAL_FILENAME}). ` +
    `Chemins testes: ${uniqueAttempts.join(', ')}\n${details}`;

  const error = new Error(message);
  (error as Error & { attempts?: string[]; causes?: Array<{ path: string; error: unknown }> }).attempts = uniqueAttempts;
  (error as Error & { attempts?: string[]; causes?: Array<{ path: string; error: unknown }> }).causes = errors;
  throw error;
}

function registerPdfResource(
  server: McpServer,
  options: {
    id: string;
    uri: string;
    title: string;
    description?: string;
    base64Data: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const { id, uri, title, description, base64Data, metadata } = options;

  server.registerResource(
    id,
    uri,
    {
      title,
      description,
      mimeType: MANUAL_MIME_TYPE
    },
    async () => ({
      contents: [
        {
          uri,
          mimeType: MANUAL_MIME_TYPE,
          data: base64Data,
          encoding: 'base64',
          metadata
        }
      ]
    })
  );
}

async function registerManualSections(
  server: McpServer,
  manualBuffer: Buffer
): Promise<void> {
  for (const section of manualSections) {
    const sectionBuffer = section.extractContent
      ? await section.extractContent(manualBuffer)
      : manualBuffer;
    const base64Data = Buffer.from(sectionBuffer).toString('base64');

    const metadata: Record<string, unknown> | undefined = section.pageRange
      ? { pageRange: section.pageRange }
      : undefined;

    registerPdfResource(server, {
      id: `${MANUAL_RESOURCE_ID}-${section.id}`,
      uri: section.uri,
      title: section.title,
      description: section.description,
      base64Data,
      metadata
    });
  }
}

export async function registerManualResource(server: McpServer): Promise<void> {
  const { buffer } = await loadManualBuffer();
  const base64Data = buffer.toString('base64');

  registerPdfResource(server, {
    id: MANUAL_RESOURCE_ID,
    uri: MANUAL_URI,
    title: MANUAL_TITLE,
    base64Data
  });

  await registerManualSections(server, buffer);

  server.sendResourceListChanged();
}

export type { ManualSection };
