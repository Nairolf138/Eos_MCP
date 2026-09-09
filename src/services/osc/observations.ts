/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscMessage } from './index';
import { oscValues } from './nativeProtocol';

export function normalizePeer(address: string): string {
  return address.replace(/^::ffff:/, '').replace(/^localhost$/, '127.0.0.1');
}
export function messagePeer(message: OscMessage): string | null {
  const source = message.source as { address?: unknown } | undefined;
  return typeof source?.address === 'string' ? normalizePeer(source.address) : null;
}

/** Passive feedback is an observation with an age, never a fabricated request/reply. */
export class OscObservations {
  private readonly entries = new Map<string, { message: OscMessage; receivedAt: number; sequence: number }>();
  private sequence = 0;
  public clear(): void { this.entries.clear(); }
  public remember(message: OscMessage): void {
    if (!/^\/eos\/out\/(?:event\/state|active\/cue|pending\/cue|active\/wheel|softkey)(?:\/|$)/.test(message.address)) return;
    this.entries.set(`${messagePeer(message) ?? '*'}:${message.address}`, { message, receivedAt: Date.now(), sequence: ++this.sequence });
    while (this.entries.size > 512) this.entries.delete(this.entries.keys().next().value!);
  }
  public read(address: string, payload: Record<string, unknown>, peer: string, maxAgeMs = 2000): { data: unknown; payload: OscMessage; observed_at: number; is_complete: boolean } | null {
    const prefix = address.replace(/\/\{[^}]+\}$/, '');
    const rows = [...this.entries.values()].filter(({ message, receivedAt }) =>
      Date.now() - receivedAt <= maxAgeMs && (messagePeer(message) === null || messagePeer(message) === normalizePeer(peer))
      && (message.address === prefix || message.address.startsWith(`${prefix}/`)))
      .sort((a, b) => b.sequence - a.sequence);
    const list = Number(payload.cuelist ?? payload.cuelist_number ?? payload.list ?? 1);
    for (const row of rows) {
      const values = oscValues(row.message);
      let data: unknown;
      let complete = true;
      if (prefix === '/eos/out/event/state') {
        if (values[0] !== 0 && values[0] !== 1) continue;
        data = { state: values[0] };
      } else if (prefix === '/eos/out/active/cue' || prefix === '/eos/out/pending/cue') {
        const match = row.message.address.match(/\/cue\/(\d+)\/(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
        if (!match || Number(match[1]) !== list) continue;
        data = { cuelist: list, cue: Number(match[2]), part: match[3] ? Number(match[3]) : 0,
          ...(prefix.includes('/active/') ? { progress: values[0] } : {}) };
      } else if (prefix === '/eos/out/active/wheel') {
        data = { wheels: rows.map(({ message }) => { const args = oscValues(message); return {
          index: Number(message.address.split('/').pop()), parameter: args[0], group: args[1], value: args[2]
        }; }), is_complete: false };
        complete = false;
      } else if (prefix === '/eos/out/softkey') {
        data = { labels: rows.map(({ message }) => ({ index: Number(message.address.split('/').pop()), label: oscValues(message)[0] })), is_complete: rows.length === 12 };
        complete = rows.length === 12;
      } else continue;
      return { data, payload: row.message, observed_at: row.receivedAt, is_complete: complete };
    }
    return null;
  }
}
