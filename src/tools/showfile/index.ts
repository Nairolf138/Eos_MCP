/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import {
  getShowfileImport,
  importShowfile,
  type ShowfileImportResult,
  type ShowfileMetadata
} from '../../services/showfile/index';
import { buildToolResult, type ToolDefinition, type ToolExecutionResult } from '../types';

const importInputSchema = {
  operator_authorized: z.boolean().describe('Autorisation operateur explicite pour lire ce showfile hors console live.'),
  localPath: z.string().min(1).optional().describe('Chemin local .esf3d a importer, obligatoirement inclus dans allowedRoot.'),
  allowedRoot: z.string().min(1).optional().describe('Repertoire racine autorise pour localPath.'),
  uploadBase64: z.string().min(1).optional().describe('Contenu .esf3d encode en base64 pour un upload controle.'),
  uploadFilename: z.string().min(1).optional().describe('Nom de fichier upload; doit finir par .esf3d.'),
  maxArchiveBytes: z.coerce.number().int().positive().optional().describe('Limite de taille de l archive .esf3d en octets.'),
  maxUncompressedBytes: z.coerce.number().int().positive().optional().describe('Limite totale de taille decompressee en octets.'),
  maxEntryBytes: z.coerce.number().int().positive().optional().describe('Limite par fichier interne extrait en octets.'),
  maxXmlFiles: z.coerce.number().int().positive().optional().describe('Nombre maximal de fichiers XML internes analyses.')
} satisfies ZodRawShape;

const importIdInputSchema = {
  import_id: z.string().min(1).optional().describe('Identifiant retourne par eos_showfile_import; omis, utilise le dernier import.')
} satisfies ZodRawShape;

function showfileStructuredContent(result: ShowfileImportResult, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    source: 'showfile',
    live: false,
    import_id: result.import_id,
    filename: result.filename,
    imported_at: result.imported_at,
    files_scanned: result.files_scanned,
    warnings: result.warnings,
    ...extra
  };
}

function buildShowfileResult(text: string, result: ShowfileImportResult, extra: Record<string, unknown>): ToolExecutionResult {
  return buildToolResult({
    text,
    summary: text,
    structuredContent: showfileStructuredContent(result, extra),
    warnings: result.warnings
  });
}

function metadataCounts(metadata: ShowfileMetadata): Record<string, number> {
  return {
    patch: metadata.patch.length,
    groups: metadata.groups.length,
    labels: metadata.labels.length,
    cues: metadata.cues.length,
    palettes: metadata.palettes.length,
    fixtures: metadata.fixtures.length
  };
}

const importTool: ToolDefinition<typeof importInputSchema> = {
  name: 'eos_showfile_import',
  config: {
    title: 'Importer un showfile Eos .esf3d hors live',
    description: 'Importe un .esf3d autorise comme archive ZIP dans un repertoire temporaire isole, extrait seulement les metadonnees XML utiles et marque la reponse source=showfile/live=false. Ce fallback exige une autorisation operateur explicite et ne remplace pas la lecture OSC live.',
    inputSchema: importInputSchema,
    annotations: {
      category: 'showfile',
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  metadata: {
    category: 'showfile',
    riskLevel: 'medium',
    requiresConfirmation: true,
    synonyms: ['esf3d', 'showfile fallback', 'offline showfile']
  },
  async handler(args) {
    const parsed = z.object(importInputSchema).strict().parse(args ?? {});
    const result = await importShowfile({
      operatorAuthorized: parsed.operator_authorized,
      localPath: parsed.localPath,
      allowedRoot: parsed.allowedRoot,
      uploadBase64: parsed.uploadBase64,
      uploadFilename: parsed.uploadFilename,
      maxArchiveBytes: parsed.maxArchiveBytes,
      maxUncompressedBytes: parsed.maxUncompressedBytes,
      maxEntryBytes: parsed.maxEntryBytes,
      maxXmlFiles: parsed.maxXmlFiles
    });

    return buildShowfileResult(
      `Showfile importe hors live (${result.files_scanned.length} fichiers XML analyses).`,
      result,
      {
        counts: metadataCounts(result),
        fallback_notice: 'Autorisation operateur explicite requise; ce fallback showfile ne remplace pas la lecture OSC live.',
        patch: result.patch,
        groups: result.groups,
        labels: result.labels,
        cues: result.cues,
        palettes: result.palettes,
        fixtures: result.fixtures
      }
    );
  }
};

function createMetadataTool<K extends keyof ShowfileMetadata>(name: string, title: string, description: string, key: K): ToolDefinition<typeof importIdInputSchema> {
  return {
    name,
    config: {
      title,
      description: `${description} Donnees issues du fallback showfile uniquement: source=showfile, live=false.`,
      inputSchema: importIdInputSchema,
      annotations: {
        category: 'showfile',
        readOnlyHint: true,
        destructiveHint: false
      }
    },
    metadata: {
      category: 'showfile',
      riskLevel: 'low',
      synonyms: ['esf3d', 'showfile offline']
    },
    async handler(args) {
      const parsed = z.object(importIdInputSchema).strict().parse(args ?? {});
      const result = getShowfileImport(parsed.import_id);
      return buildShowfileResult(
        `${result[key].length} entree(s) ${String(key)} lue(s) depuis le showfile hors live.`,
        result,
        { [key]: result[key] }
      );
    }
  };
}

const showfileTools = [
  importTool,
  createMetadataTool('eos_showfile_get_patch', 'Lire le patch du showfile importe', 'Retourne les entrees patch extraites des XML internes disponibles.', 'patch'),
  createMetadataTool('eos_showfile_list_groups', 'Lister les groupes du showfile importe', 'Retourne les groupes extraits des XML internes disponibles.', 'groups'),
  createMetadataTool('eos_showfile_list_labels', 'Lister les labels du showfile importe', 'Retourne les labels extraits des XML internes disponibles.', 'labels'),
  createMetadataTool('eos_showfile_list_cues', 'Lister les cues du showfile importe', 'Retourne les cues extraites des XML internes disponibles.', 'cues'),
  createMetadataTool('eos_showfile_list_palettes', 'Lister les palettes du showfile importe', 'Retourne les palettes extraites des XML internes disponibles.', 'palettes'),
  createMetadataTool('eos_showfile_list_fixtures', 'Lister les fixtures du showfile importe', 'Retourne les fixtures extraites des XML internes disponibles.', 'fixtures')
] satisfies ToolDefinition[];

export default showfileTools;
