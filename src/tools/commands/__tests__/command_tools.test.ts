/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import {
  eosCommandTool,
  eosNewCommandTool,
  eosCommandWithSubstitutionTool,
  eosGetCommandLineTool,
  ensureTerminator
} from '../command_tools';
import { clearCurrentUserId, setCurrentUserId } from '../../session';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

describe('ensureTerminator', () => {
  it.each([
    ['Record Cue 2', 'Record Cue 2#'],
    ['Record Cue 2#', 'Record Cue 2#'],
    ['Delete Cue 2 Enter', 'Delete Cue 2 Enter'],
    ['Step 1 Thru 8 Enter Enter', 'Step 1 Thru 8 Enter Enter']
  ])('normalise le terminateur de %s', (command, expectedCommand) => {
    expect(ensureTerminator(command, true)).toBe(expectedCommand);
  });
});

describe('command tools', () => {
  class FakeOscService implements OscGateway {
    public readonly sentMessages: OscMessage[] = [];

    private readonly listeners = new Set<(message: OscMessage) => void>();

    public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
      this.sentMessages.push(message);
    }

    public onMessage(listener: (message: OscMessage) => void): () => void {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }

    public emit(message: OscMessage): void {
      this.listeners.forEach((listener) => listener(message));
    }
  }

  let service: FakeOscService;
  let client: OscClient;

  beforeEach(() => {
    service = new FakeOscService();
    client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    clearCurrentUserId();
  });

  afterEach(() => {
    setOscClient(null);
    clearCurrentUserId();
  });


  it('retourne la commande calculee sans envoi en dry_run', async () => {
    const result = await runTool(eosCommandTool, { command: 'Go To Cue 9', dry_run: true, user: 3 });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured).toMatchObject({
      action: 'command',
      dry_run: true,
      osc: { address: '/eos/cmd' },
      cli: { text: 'Go To Cue 9' }
    });
  });

  it('bloque les commandes sensibles sans confirmation explicite', async () => {
    await expect(runTool(eosCommandTool, { command: 'Record Cue 1' })).rejects.toThrow('Action sensible bloquee');
    expect(service.sentMessages).toHaveLength(0);
  });

  it('autorise les commandes sensibles avec confirmation explicite', async () => {
    await runTool(eosCommandTool, { command: 'Record Cue 1', require_confirmation: true });
    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('distingue transport OSC et validation EOS dans le resultat structure', async () => {
    const result = await runTool(eosCommandTool, { command: 'Record Cue 1', require_confirmation: true });
    const structured = getStructuredContent(result);

    expect(structured).toMatchObject({
      status: 'ok',
      sent_to_transport: true,
      accepted_by_eos: null,
      verified: false
    });
  });

  it('retourne partial_failure quand la verification optionnelle apres Record Cue expire', async () => {
    const result = await runTool(eosCommandTool, {
      command: 'Record Cue 1',
      require_confirmation: true,
      verify_after_send: true,
      verification_timeout_ms: 10
    });
    const structured = getStructuredContent(result);

    expect(service.sentMessages.map((message) => message.address)).toEqual(['/eos/cmd', '/eos/get/cuelist']);
    expect(structured).toMatchObject({
      status: 'partial_failure',
      sent_to_transport: true,
      accepted_by_eos: null,
      verified: false,
      verification: {
        status: 'not_verified',
        method: 'eos_cue_list_all',
        warning: 'commande envoyée mais non vérifiée dans EOS'
      }
    });
  });

  it('active la verification par defaut pour une commande sensible quand la lecture JSON est confirmee', async () => {
    const probe = client.probeCapabilities({ timeoutMs: 20 });
    queueMicrotask(() => {
      service.emit({
        address: '/eos/get/version',
        args: [{ type: 's', value: JSON.stringify({ version: '3.2.10' }) }]
      });
    });
    await probe;
    service.sentMessages.length = 0;

    const result = await runTool(eosCommandTool, {
      command: 'Record Cue 1',
      require_confirmation: true,
      verification_timeout_ms: 10
    });
    const structured = getStructuredContent(result);

    expect(service.sentMessages.map((message) => message.address)).toEqual(['/eos/cmd', '/eos/get/cuelist']);
    expect(structured).toMatchObject({
      status: 'partial_failure',
      verification: {
        status: 'not_verified',
        method: 'eos_cue_list_all'
      }
    });
  });

  it('ajoute un warning fort et des next_actions quand une commande sensible reste non verifiee en lecture legacy', async () => {
    const result = await runTool(eosCommandWithSubstitutionTool, {
      template: 'Delete Cue %1',
      values: [7],
      require_confirmation: true,
      safety_level: 'off'
    });
    const structured = getStructuredContent(result);

    expect(service.sentMessages.map((message) => message.address)).toEqual(['/eos/cmd']);
    expect(structured).toMatchObject({
      status: 'ok',
      sent_to_transport: true,
      accepted_by_eos: null,
      verified: false,
      verification: {
        status: 'skipped',
        details: {
          reason: 'json_read_unavailable'
        }
      }
    });
    expect(structured?.warnings).toEqual([
      expect.objectContaining({ detail: expect.stringContaining('COMMANDE SENSIBLE ENVOYEE MAIS NON VERIFIEE') })
    ]);
    expect(structured?.next_actions).toEqual(expect.arrayContaining([
      expect.stringContaining('relecture manuelle'),
      expect.stringContaining('Confirmer explicitement')
    ]));
  });

  it('envoie une commande en respectant le terminateur', async () => {
    const result = await runTool(eosCommandTool, { command: 'Go To Cue 1', terminateWithEnter: true, user: 2 });

    expect(service.sentMessages).toHaveLength(2);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/user',
      args: [{ type: 'i', value: 2 }]
    });
    expect(service.sentMessages[1]).toMatchObject({
      address: '/eos/cmd',
      args: [{ type: 's', value: 'Go To Cue 1#' }]
    });

    expect(getStructuredContent(result)).toBeDefined();
  });

  it('applique la substitution et efface la ligne pour eos_new_command', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Record Cue %1 Time %2',
      substitutions: [5, '10'],
      clearLine: true,
      terminateWithEnter: true,
      require_confirmation: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [
        { type: 's', value: 'Record Cue 5 Time 10#' }
      ]
    });
  });

  it('refuse une commande composee de programmation de cue dans eos_new_command', async () => {
    await expect(
      runTool(eosNewCommandTool, {
        command: 'Chan 1 Thru 10 At 100 Record Cue 10 Label "Outro"',
        safety_level: 'off',
        require_confirmation: true
      })
    ).rejects.toThrow('Sequence correcte: Chan 1 Thru 10 At Full puis Record Cue 3 puis Cue 3 Label "Reggae"');

    expect(service.sentMessages).toHaveLength(0);
  });

  it('autorise la programmation de cue envoyee en commandes separees', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Chan 1 Thru 10 At Full',
      clearLine: true,
      safety_level: 'off'
    });
    await runTool(eosNewCommandTool, {
      command: 'Record Cue 3',
      clearLine: true,
      safety_level: 'off',
      require_confirmation: true
    });
    await runTool(eosNewCommandTool, {
      command: 'Cue 3 Label "Reggae"',
      clearLine: true,
      safety_level: 'off',
      require_confirmation: true
    });

    expect(service.sentMessages).toHaveLength(3);
    expect(service.sentMessages.map((message) => message.args?.[0]?.value)).toEqual([
      'Chan 1 Thru 10 At Full',
      'Record Cue 3',
      'Cue 3 Label "Reggae"'
    ]);
  });

  it('peut envoyer un new_command sans effacement prealable', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Go To Cue %1',
      substitutions: [1],
      clearLine: false
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('envoie une commande via gabarit avec substitutions numerotees', async () => {
    await runTool(eosCommandWithSubstitutionTool, {
      template: 'Go To Cue %1/%2',
      values: [1, 2],
      terminateWithEnter: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/cmd',
      args: [
        { type: 's', value: 'Go To Cue 1/2#' }
      ]
    });
  });

  it('recupere la ligne de commande et decode le numero utilisateur', async () => {
    const promise = runTool(eosGetCommandLineTool, { user: 4 });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/get/cmd_line',
        args: [
          {
            type: 's',
            value: JSON.stringify({ text: 'Chan 1 At 50', user: 'User 4' })
          }
        ]
      });
    });

    const result = await promise;
    const structuredContent = getStructuredContent(result);

    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toMatchObject({
      status: 'ok',
      text: 'Chan 1 At 50',
      user: 4
    });

    expect(service.sentMessages[0]).toMatchObject({ address: '/eos/get/cmd_line' });
  });

  it('utilise le numero utilisateur stocke lorsquaucun identifiant nest fourni', async () => {
    setCurrentUserId(6);

    await runTool(eosCommandTool, { command: 'Go', terminateWithEnter: true });

    expect(service.sentMessages).toHaveLength(2);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/user',
      args: [{ type: 'i', value: 6 }]
    });
    expect(service.sentMessages[1]).toMatchObject({
      address: '/eos/cmd',
      args: [{ type: 's', value: 'Go#' }]
    });
  });

  it('autorise les commandes patch en mode standard', async () => {
    await runTool(eosCommandTool, { command: 'Patch 101 Enter', safety_level: 'standard' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('bloque une commande hors allowlist stricte avec message actionnable', async () => {
    await expect(runTool(eosCommandTool, { command: 'Patch 101 Enter' })).rejects.toThrow(
      'regle violee security.strict.allowlist'
    );
    await expect(runTool(eosCommandTool, { command: 'Patch 101 Enter' })).rejects.toThrow(
      'Commande autorisee la plus proche'
    );
  });

  it('bloque une commande avec caracteres interdits et indique la regle violee', async () => {
    await expect(runTool(eosCommandTool, { command: 'Go To Cue 1$' })).rejects.toThrow(
      'regle violee syntax.allowed_chars'
    );
  });

  it('propose une commande proche en cas de faute de frappe EOS reelle', async () => {
    await expect(runTool(eosCommandTool, { command: 'Recrod Cue 8', require_confirmation: true })).rejects.toThrow(
      'Record Cue 1'
    );
  });

  it('permet des interactions multi-utilisateurs pour la recuperation de ligne de commande', async () => {
    setCurrentUserId(2);
    const firstPromise = runTool(eosGetCommandLineTool, {});

    queueMicrotask(() => {
      const [first] = service.sentMessages;
      const firstPayload = first?.args?.[0]?.value as string;
      expect(JSON.parse(firstPayload)).toEqual({ user: 2 });

      service.emit({
        address: '/eos/get/cmd_line',
        args: [
          {
            type: 's',
            value: JSON.stringify({ text: 'User 2 Cmd', user: 'User 2' })
          }
        ]
      });
    });

    await firstPromise;

    setCurrentUserId(5);
    const secondPromise = runTool(eosGetCommandLineTool, {});

    queueMicrotask(() => {
      const [, second] = service.sentMessages;
      const secondPayload = second?.args?.[0]?.value as string;
      expect(JSON.parse(secondPayload)).toEqual({ user: 5 });

      service.emit({
        address: '/eos/get/cmd_line',
        args: [
          {
            type: 's',
            value: JSON.stringify({ text: 'User 5 Cmd', user: 'User 5' })
          }
        ]
      });
    });

    await secondPromise;
  });
});
