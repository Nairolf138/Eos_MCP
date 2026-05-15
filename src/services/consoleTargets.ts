/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { EOS_CONSOLES_ENV } from '../config/env';
import { getConfig } from '../config/index';

export interface ConsoleTarget {
  name: string;
  address: string;
  port: number;
}

export interface ConsoleTargetResolution {
  targetConsole: string | null;
  targetAddress: string;
  targetPort: number;
}

export interface ConsoleTargetInput {
  targetConsole?: string;
  targetAddress?: string;
  targetPort?: number;
}

function parsePort(value: unknown, label: string): number {
  const raw = typeof value === 'string' ? value.trim() : String(value);
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`${label} doit etre un entier entre 1 et 65535.`);
  }
  return port;
}

function normaliseName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Le nom de console EOS ne peut pas etre vide.');
  }
  return trimmed;
}

function targetFromObject(name: string, value: unknown): ConsoleTarget {
  if (typeof value === 'string') {
    return targetFromString(name, value);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`La cible EOS "${name}" doit etre une chaine ou un objet.`);
  }

  const record = value as Record<string, unknown>;
  const address = record.address ?? record.host ?? record.targetAddress;
  const port = record.port ?? record.udpPort ?? record.targetPort;
  if (typeof address !== 'string' || address.trim().length === 0) {
    throw new Error(`La cible EOS "${name}" doit definir une adresse.`);
  }

  return {
    name: normaliseName(name),
    address: address.trim(),
    port: parsePort(port, `Le port de la cible EOS "${name}"`)
  };
}

function targetFromString(name: string, value: string): ConsoleTarget {
  const raw = value.trim();
  if (raw.length === 0) {
    throw new Error(`La cible EOS "${name}" ne peut pas etre vide.`);
  }

  const separator = raw.lastIndexOf(':');
  if (separator <= 0 || separator === raw.length - 1) {
    throw new Error(`La cible EOS "${name}" doit utiliser le format adresse:port.`);
  }

  return {
    name: normaliseName(name),
    address: raw.slice(0, separator).trim(),
    port: parsePort(raw.slice(separator + 1), `Le port de la cible EOS "${name}"`)
  };
}

export function parseConsoleTargets(raw: string | undefined | null): ConsoleTarget[] {
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${EOS_CONSOLES_ENV} doit contenir un objet JSON.`);
    }
    return Object.entries(parsed as Record<string, unknown>).map(([name, value]) => targetFromObject(name, value));
  }

  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf('=');
      if (separator <= 0 || separator === entry.length - 1) {
        throw new Error(`${EOS_CONSOLES_ENV} doit utiliser le format nom=adresse:port pour les listes.`);
      }
      return targetFromString(entry.slice(0, separator), entry.slice(separator + 1));
    });
}

export function getConfiguredConsoleTargets(env: NodeJS.ProcessEnv = process.env): ConsoleTarget[] {
  return parseConsoleTargets(env[EOS_CONSOLES_ENV]);
}

export function getDefaultConsoleTarget(): ConsoleTarget {
  const config = getConfig().osc;
  return {
    name: 'default',
    address: config.remoteAddress,
    port: config.udpOutPort
  };
}

export function listConsoleTargets(env: NodeJS.ProcessEnv = process.env): ConsoleTarget[] {
  const configured = getConfiguredConsoleTargets(env);
  if (configured.length > 0) {
    return configured;
  }
  return [getDefaultConsoleTarget()];
}

export function resolveConsoleTarget(
  input: ConsoleTargetInput = {},
  env: NodeJS.ProcessEnv = process.env
): ConsoleTargetResolution {
  const requestedConsole = input.targetConsole?.trim();
  const configured = listConsoleTargets(env);
  const selected = requestedConsole
    ? configured.find((target) => target.name === requestedConsole)
    : configured.find((target) => target.name === 'main') ?? configured[0];

  if (!selected) {
    throw new Error('Aucune cible console EOS n est configuree.');
  }

  if (requestedConsole && selected.name !== requestedConsole) {
    throw new Error(`Console EOS inconnue "${requestedConsole}". Cibles disponibles: ${configured.map((target) => target.name).join(', ')}.`);
  }

  return {
    targetConsole: requestedConsole ? selected.name : (selected.name === 'default' ? null : selected.name),
    targetAddress: input.targetAddress ?? selected.address,
    targetPort: input.targetPort ?? selected.port
  };
}
