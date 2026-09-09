/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { frame, nativeObject } from '../../../services/osc/__tests__/fixtures/nativePeer';
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
      osc: { address: '/eos/user/3/cmd' },
      cli: { text: 'Go To Cue 9' }
    });
  });

  it('bloque les commandes sensibles sans confirmation explicite', async () => {
    await expect(runTool(eosCommandTool, { command: 'Record Cue 1' })).rejects.toThrow('Action sensible bloquee');
    expect(service.sentMessages).toHaveLength(0);
  });

  it('refuse les commandes texte libres hors profil strict /eos/cmd', async () => {
    await expect(runTool(eosCommandTool, { command: 'Patch 1 At 1/001' })).rejects.toThrow(/security\.strict\.allowlist/);
    expect(service.sentMessages).toHaveLength(0);
  });

  it('borne explicitement le user id des commandes texte', async () => {
    await expect(runTool(eosCommandTool, { command: 'Go To Cue 1', user: 1000 })).rejects.toThrow();
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

    expect(service.sentMessages.map((message) => message.address)).toEqual(['/eos/cmd']);
    expect(structured).toMatchObject({
      status: 'partial_failure',
      sent_to_transport: true,
      accepted_by_eos: null,
      verified: false,
      verification: {
        status: 'not_verified',
        method: 'fresh_eos_command_line',
        warning: 'commande envoyée mais non vérifiée dans EOS'
      }
    });
  });

  it('active la verification par defaut pour une commande sensible quand la lecture OSC native est confirmee', async () => {
    const probe = client.probeCapabilities({ timeoutMs: 20 });
    queueMicrotask(() => {
      service.emit({
        address: '/eos/out/get/version',
        args: [{ type: 's', value: '3.2.10' }, {type:'s',value:'Fixture Library'}, {type:'F',value:false}]
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

    expect(service.sentMessages.map((message) => message.address)).toEqual(['/eos/cmd']);
    expect(structured).toMatchObject({
      status: 'partial_failure',
      verification: {
        status: 'not_verified',
        method: 'fresh_eos_command_line'
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
          reason: 'native_read_unavailable'
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
    const result = await runTool(eosCommandTool, { command: 'Go To Cue 1', terminateWithEnter: true, user: 2, confirm: true });

    expect(service.sentMessages).toEqual([{address:'/eos/user/2/cmd',args:[{type:'s',value:'Go To Cue 1#'}]}]);

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
      'Chan 1 Thru 10 At Full#',
      'Record Cue 3#',
      'Cue 3 Label "Reggae"#'
    ]);
  });

  it('peut envoyer un new_command sans effacement prealable', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Go To Cue %1',
      substitutions: [1],
      clearLine: false,
      confirm: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('envoie une commande via gabarit avec substitutions numerotees', async () => {
    await runTool(eosCommandWithSubstitutionTool, {
      template: 'Go To Cue %1/%2',
      values: [1, 2],
      terminateWithEnter: true,
      confirm: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/cmd',
      args: [
        { type: 's', value: 'Go To Cue 1/2#' }
      ]
    });
  });

  it('attend une diffusion native pour un utilisateur sans envoyer de requete', async () => {
    const promise=runTool(eosGetCommandLineTool,{user:4});
    queueMicrotask(()=>service.emit(frame('/eos/out/user/4/cmd',['Chan 1 At 50',0])));
    const result=await promise;
    expect(result.structuredContent).toMatchObject({status:'ok',text:'Chan 1 At 50',user:4,source:'official_osc_out',command_error:false});
    expect(service.sentMessages).toEqual([]);
  });

  it('indique la source officielle lorsque la ligne de commande vient de /eos/out/user/<number>/cmd', async () => {
    service.emit({
      address: '/eos/out/user/4/cmd',
      args: [{ type: 's', value: 'Chan 4 At 80' }, {type:'i',value:0}]
    });

    const result = await runTool(eosGetCommandLineTool, { user: 4 });
    const structuredContent = getStructuredContent(result);

    expect(structuredContent).toMatchObject({
      status: 'ok',
      text: 'Chan 4 At 80',
      user: 4,
      source: 'official_osc_out',
      source_description: 'source officielle /eos/out/cmd ou /eos/out/user/<number>/cmd'
    });
    expect(result.content?.[0]?.text).toContain('source officielle /eos/out/cmd ou /eos/out/user/<number>/cmd');
    expect(service.sentMessages).toHaveLength(0);
  });

  it('utilise le numero utilisateur stocke lorsquaucun identifiant nest fourni', async () => {
    setCurrentUserId(6);

    await runTool(eosCommandTool, { command: 'Go', terminateWithEnter: true, confirm: true });

    expect(service.sentMessages).toEqual([{address:'/eos/user/6/cmd',args:[{type:'s',value:'Go#'}]}]);
  });

  it('autorise les commandes patch en mode standard', async () => {
    await runTool(eosCommandTool, { command: 'Patch 101 Enter', safety_level: 'standard', require_confirmation: true });

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

  it('separe les retours de deux utilisateurs sans changer l utilisateur global de la console', async () => {
    const first=runTool(eosGetCommandLineTool,{user:2});
    const second=runTool(eosGetCommandLineTool,{user:5});
    service.emit(frame('/eos/out/user/5/cmd',['User 5 Cmd',0]));
    service.emit(frame('/eos/out/user/2/cmd',['User 2 Cmd',1]));
    expect((await first).structuredContent).toMatchObject({user:2,text:'User 2 Cmd',command_error:true});
    expect((await second).structuredContent).toMatchObject({user:5,text:'User 5 Cmd',command_error:false});
    expect(service.sentMessages).toEqual([]);
  });

  it.each(['stale','wrong_user','existing_cue','error','fresh'])('Record acknowledgement requires fresh matching feedback: %s', async mode=>{
    const command='Record Cue 2/10#';
    if(mode==='stale')service.emit(frame('/eos/out/user/3/cmd',[command,0]));
    service.send=async message=>{
      service.sentMessages.push(message);
      if(mode==='existing_cue')for(const response of nativeObject('cue',10,-1,'Already there',2))service.emit(response);
      else if(mode!=='stale')service.emit(frame(`/eos/out/user/${mode==='wrong_user'?4:3}/cmd`,[command,mode==='error'?1:0]));
    };
    const result=await runTool(eosNewCommandTool,{command,user:3,require_confirmation:true,verify_after_send:true,verification_timeout_ms:15});
    expect(result.structuredContent).toMatchObject({verified:false,accepted_by_eos:mode==='fresh'?true:mode==='error'?false:null,status:mode==='fresh'?'ok':'partial_failure'});
    expect(service.sentMessages).toHaveLength(1);
  });
});
