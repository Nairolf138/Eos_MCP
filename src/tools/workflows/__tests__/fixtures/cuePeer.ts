/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscMessage } from '../../../../services/osc';
import type { OscGateway } from '../../../../services/osc/client';
import { frame, nativeObject } from '../../../../services/osc/__tests__/fixtures/nativePeer';

/** Synthetic control-flow fixture. Matching these commands is not Eos CLI validation. */
export class CuePeer implements OscGateway {
  readonly sent: OscMessage[] = [];
  readonly cues = new Map<string, string>();
  readonly listeners = new Set<(message: OscMessage) => void>();
  silent = false;
  ignoreRecord = false;
  ignoreLabel = false;
  rejectCommand: string | null = null;
  failAddress: string | null = null;
  onMessage(listener: (message: OscMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(message: OscMessage) { for (const listener of this.listeners) listener(message); }
  writes() { return this.sent.filter(message => !message.address.startsWith('/eos/get/')); }
  async send(message: OscMessage) {
    this.sent.push(message);
    if (message.address === this.failAddress) throw new Error('Synthetic send failure');
    const address = message.address.replace(/^\/eos\/user\/\d+\//, '/eos/');
    const command = String(message.args?.[0]?.value ?? '');
    if (address === '/eos/newcmd' || address === '/eos/cmd') {
      const rejected = this.rejectCommand != null && command.includes(this.rejectCommand);
      const record = command.match(/Record Cue (\d+)\/([\d.]+)#/);
      if (record && !this.ignoreRecord && !rejected) this.cues.set(`${record[1]}/${record[2]}`, '');
      const user = message.address.match(/^\/eos\/user\/(\d+)\//)?.[1];
      if (!this.silent) this.emit(frame(user == null ? '/eos/out/cmd' : `/eos/out/user/${user}/cmd`, [command, rejected ? 1 : 0]));
    }
    const label = address.match(/^\/eos\/set\/cue\/(\d+)\/([\d.]+)\/label$/);
    if (label && !this.ignoreLabel) this.cues.set(`${label[1]}/${label[2]}`, command);
    const cue = address.match(/^\/eos\/get\/cue\/(\d+)\/([\d.]+)\/0$/);
    if (cue && !this.silent) {
      const text = this.cues.get(`${cue[1]}/${cue[2]}`);
      const replies = text == null ? [frame(address.replace('/get/', '/out/get/'), [])] : nativeObject('cue',Number(cue[2]),-1,text,Number(cue[1]));
      for (const reply of replies) this.emit(reply);
    }
  }
}
