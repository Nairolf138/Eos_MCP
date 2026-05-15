/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */

export type EosNodeRole = 'Primary' | 'Backup' | 'Unknown';
export type FunctionalAvailability = 'available' | 'limited' | 'unavailable';
export type EosCompatibilityFeature =
  | 'handshake'
  | 'cues'
  | 'macros'
  | 'patch'
  | 'pixel_maps'
  | 'dmx'
  | 'fpe'
  | 'magic_sheets'
  | 'speed_fallback'
  | 'baseline';

export interface CompatibilityContext {
  eosVersion: string | null;
  role: EosNodeRole;
}

export interface CompatibilityRule {
  id: string;
  feature: EosCompatibilityFeature;
  minEosVersion: string | null;
  requiredRole: 'Primary' | 'Backup' | 'Any';
  functionalAvailability: FunctionalAvailability;
  notes?: string;
}

export interface VersionFeatureCompatibility {
  eosVersionFamily: '2.x' | '3.x';
  feature: EosCompatibilityFeature;
  minEosVersion: string | null;
  functionalAvailability: FunctionalAvailability;
  notes: string;
}

interface RuleEntry {
  matches: (toolName: string) => boolean;
  rule: CompatibilityRule;
}

export interface CompatibilityStatus {
  tool: string;
  compatible: boolean;
  reasons: string[];
  requirements: CompatibilityRule;
  context: CompatibilityContext;
}

const BASELINE_RULE: CompatibilityRule = {
  id: 'baseline-eos-osc-tools',
  feature: 'baseline',
  minEosVersion: '3.0.0',
  requiredRole: 'Any',
  functionalAvailability: 'available',
  notes: 'Compatibilite par defaut pour les outils OSC eos_* non classes explicitement.'
};

export const EOS_VERSION_FEATURE_COMPATIBILITY: VersionFeatureCompatibility[] = [
  {
    eosVersionFamily: '2.x',
    feature: 'handshake',
    minEosVersion: '2.0.0',
    functionalAvailability: 'limited',
    notes: 'Handshake OSC historique et ping disponibles; la selection de protocole peut etre absente ou degradee.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'cues',
    minEosVersion: '2.0.0',
    functionalAvailability: 'available',
    notes: 'Commandes cue/cuelist de base via OSC et ligne de commande.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'macros',
    minEosVersion: '2.0.0',
    functionalAvailability: 'available',
    notes: 'Selection, declenchement et lecture de macros de base.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'patch',
    minEosVersion: '2.9.0',
    functionalAvailability: 'limited',
    notes: 'Patch canal et lectures simples; les donnees Augment3d restent reservees a EOS 3.x.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'pixel_maps',
    minEosVersion: null,
    functionalAvailability: 'unavailable',
    notes: 'Les outils MCP de pixel map sont gates sur EOS 3.x.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'dmx',
    minEosVersion: '2.0.0',
    functionalAvailability: 'available',
    notes: 'Selection et ecriture DMX adresse/canal exposees par les commandes OSC de base.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'fpe',
    minEosVersion: null,
    functionalAvailability: 'unavailable',
    notes: 'Les donnees FPE sont gates sur EOS 3.x.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'magic_sheets',
    minEosVersion: '2.9.0',
    functionalAvailability: 'limited',
    notes: 'Ouverture/lecture limitee; injection de texte reservee a EOS 3.2+ Primary.'
  },
  {
    eosVersionFamily: '2.x',
    feature: 'speed_fallback',
    minEosVersion: null,
    functionalAvailability: 'available',
    notes: 'Fallback transport MCP vers le mode speed/UDP quand le transport fiable ne repond pas.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'handshake',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Handshake canonique avec detection de version et selection ETCOSC.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'cues',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Commandes et requetes cue/cuelist completes exposees par les outils MCP.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'macros',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Selection, declenchement et details macro.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'patch',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Patch canal et lectures Augment3d position/beam.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'pixel_maps',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Selection et lecture des pixel maps.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'dmx',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Outils DMX canal/adresse disponibles.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'fpe',
    minEosVersion: '3.0.0',
    functionalAvailability: 'available',
    notes: 'Lecture des sets/points FPE.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'magic_sheets',
    minEosVersion: '3.1.0',
    functionalAvailability: 'available',
    notes: 'Lecture/ouverture magic sheet; injection de texte a partir de 3.2 sur Primary.'
  },
  {
    eosVersionFamily: '3.x',
    feature: 'speed_fallback',
    minEosVersion: null,
    functionalAvailability: 'available',
    notes: 'Fallback transport MCP speed/UDP conserve pour les reseaux mixtes TCP/UDP.'
  }
];

function toolStartsWith(toolName: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => toolName.startsWith(prefix));
}

const COMPATIBILITY_RULES: RuleEntry[] = [
  {
    matches: (toolName) => toolName === 'eos_magic_sheet_send_string',
    rule: {
      id: 'magic-sheet-send-string-primary-only',
      feature: 'magic_sheets',
      minEosVersion: '3.2.0',
      requiredRole: 'Primary',
      functionalAvailability: 'available',
      notes: 'Necessite EOS 3.2+ et un noeud Primary pour pouvoir injecter du texte.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_connect', 'eos_configure', 'eos_ping', 'eos_reset', 'eos_subscribe']),
    rule: {
      id: 'connection-tools-bootstrap',
      feature: 'handshake',
      minEosVersion: null,
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Outils de connexion utilisables meme avant detection de version EOS; inclut le fallback speed/UDP.'
    }
  },
  {
    matches: (toolName) => toolName === 'eos_capabilities_get',
    rule: {
      id: 'capabilities-meta-tool',
      feature: 'baseline',
      minEosVersion: null,
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Outil meta; ne doit jamais etre bloque par la matrice.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_cue_', 'eos_cuelist_']) || ['eos_get_active_cue', 'eos_get_pending_cue', 'eos_set_cue_send_string', 'eos_set_cue_receive_string'].includes(toolName),
    rule: {
      id: 'cue-tools-eos2-compatible',
      feature: 'cues',
      minEosVersion: '2.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Cues et cuelists supportees sur EOS 2.x et 3.x; preferer une lecture explicite pour confirmer les donnees retourneees.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_macro_']),
    rule: {
      id: 'macro-tools-eos2-compatible',
      feature: 'macros',
      minEosVersion: '2.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Macros supportees sur EOS 2.x et 3.x.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_patch_get_augment3d_']),
    rule: {
      id: 'patch-augment3d-eos3-only',
      feature: 'patch',
      minEosVersion: '3.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Informations Augment3d du patch disponibles uniquement dans la famille EOS 3.x.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_patch_']),
    rule: {
      id: 'patch-basic-eos29-limited',
      feature: 'patch',
      minEosVersion: '2.9.0',
      requiredRole: 'Any',
      functionalAvailability: 'limited',
      notes: 'Patch canal de base compatible EOS 2.9+; certaines donnees detaillees peuvent etre absentes en EOS 2.x.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_pixmap_', 'eos_pixel_map_']),
    rule: {
      id: 'pixel-map-tools-eos3',
      feature: 'pixel_maps',
      minEosVersion: '3.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Pixel maps gates sur EOS 3.x.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_fpe_']),
    rule: {
      id: 'fpe-tools-eos3',
      feature: 'fpe',
      minEosVersion: '3.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'FPE gates sur EOS 3.x.'
    }
  },
  {
    matches: (toolName) => toolName === 'eos_set_dmx' || toolName === 'eos_channel_set_dmx' || toolStartsWith(toolName, ['eos_address_']),
    rule: {
      id: 'dmx-tools-eos2-compatible',
      feature: 'dmx',
      minEosVersion: '2.0.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'DMX canal/adresse supporte sur EOS 2.x et 3.x.'
    }
  },
  {
    matches: (toolName) => toolStartsWith(toolName, ['eos_magic_sheet_']),
    rule: {
      id: 'magic-sheet-basic-eos31',
      feature: 'magic_sheets',
      minEosVersion: '3.1.0',
      requiredRole: 'Any',
      functionalAvailability: 'available',
      notes: 'Lecture et ouverture de magic sheets supportees a partir de EOS 3.1.'
    }
  }
];

function parseVersion(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) {
    return null;
  }

  const parsed = cleaned
    .split('.')
    .map((segment) => Number.parseInt(segment.replace(/[^0-9].*$/, ''), 10));

  if (parsed.some((segment) => Number.isNaN(segment))) {
    return null;
  }

  return [parsed[0] ?? 0, parsed[1] ?? 0, parsed[2] ?? 0];
}

function compareVersions(left: string, right: string): number | null {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);

  if (!leftParsed || !rightParsed) {
    return null;
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParsed[index]! > rightParsed[index]!) {
      return 1;
    }
    if (leftParsed[index]! < rightParsed[index]!) {
      return -1;
    }
  }

  return 0;
}

function isOscTool(toolName: string): boolean {
  return toolName.startsWith('eos_');
}

function resolveRule(toolName: string): CompatibilityRule {
  const matching = COMPATIBILITY_RULES.find((entry) => entry.matches(toolName));
  if (matching) {
    return matching.rule;
  }

  if (isOscTool(toolName)) {
    return BASELINE_RULE;
  }

  return {
    id: 'non-osc-tool',
    feature: 'baseline',
    minEosVersion: null,
    requiredRole: 'Any',
    functionalAvailability: 'available',
    notes: 'Outil non OSC: pas de contrainte de compatibilite EOS.'
  };
}

export function evaluateToolCompatibility(toolName: string, context: CompatibilityContext): CompatibilityStatus {
  const requirements = resolveRule(toolName);
  const reasons: string[] = [];

  if (requirements.functionalAvailability === 'unavailable') {
    reasons.push('Fonctionnalite marquee comme indisponible dans la matrice.');
  }

  if (requirements.requiredRole !== 'Any' && context.role !== 'Unknown' && context.role !== requirements.requiredRole) {
    reasons.push(`Role requis: ${requirements.requiredRole}, role detecte: ${context.role}.`);
  }

  if (requirements.requiredRole !== 'Any' && context.role === 'Unknown') {
    reasons.push(`Role requis: ${requirements.requiredRole}, role detecte: inconnu.`);
  }

  if (requirements.minEosVersion && context.eosVersion) {
    const comparison = compareVersions(context.eosVersion, requirements.minEosVersion);
    if (comparison === null) {
      reasons.push(`Version EOS non interpretable (${context.eosVersion}). Minimum requis: ${requirements.minEosVersion}.`);
    } else if (comparison < 0) {
      reasons.push(`Version EOS detectee ${context.eosVersion} inferieure au minimum ${requirements.minEosVersion}.`);
    }
  }

  return {
    tool: toolName,
    compatible: reasons.length === 0,
    reasons,
    requirements,
    context
  };
}

export function getCompatibilityRulesForTools(toolNames: string[]): Array<{ tool: string; rule: CompatibilityRule }> {
  return toolNames
    .map((tool) => ({ tool, rule: resolveRule(tool) }))
    .sort((left, right) => left.tool.localeCompare(right.tool));
}

export function getEosVersionFeatureCompatibility(): VersionFeatureCompatibility[] {
  return [...EOS_VERSION_FEATURE_COMPATIBILITY];
}

function parseRole(raw: unknown): EosNodeRole {
  if (typeof raw !== 'string') {
    return 'Unknown';
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'primary') {
    return 'Primary';
  }
  if (normalized === 'backup' || normalized === 'secondary') {
    return 'Backup';
  }

  return 'Unknown';
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function resolveCompatibilityContext(args: unknown, extra: unknown): CompatibilityContext {
  const argRecord = asObject(args);
  const extraRecord = asObject(extra);

  const argConnection = asObject(argRecord.connection);
  const extraConnection = asObject(extraRecord.connection);

  const eosVersionCandidate =
    argRecord.eosVersion ??
    argRecord.eos_version ??
    extraRecord.eosVersion ??
    extraRecord.eos_version ??
    argConnection.eosVersion ??
    argConnection.eos_version ??
    extraConnection.eosVersion ??
    extraConnection.eos_version;

  const roleCandidate =
    argRecord.role ??
    argRecord.connectionRole ??
    argRecord.connection_role ??
    extraRecord.role ??
    extraRecord.connectionRole ??
    extraRecord.connection_role ??
    argConnection.role ??
    extraConnection.role;

  return {
    eosVersion: typeof eosVersionCandidate === 'string' && eosVersionCandidate.trim().length > 0
      ? eosVersionCandidate.trim()
      : null,
    role: parseRole(roleCandidate)
  };
}
