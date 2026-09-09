/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { eosWheelTickTool, eosWheelSwitchContinuousTool, eosSetColorHsTool, eosSetColorRgbTool, eosSetPanTiltXYTool, eosSetXYZPositionTool } from '../index';

describe('Native parameter units and validation', () => {
 let sent: OscMessage[];
 beforeEach(()=>{
  sent=[]; const peer: OscGateway={async send(message){sent.push(message);},onMessage(){return ()=>{};}};
  setOscClient(new OscClient(peer));
 });
 afterEach(()=>setOscClient(null));
 test('preserves signed fractional encoder ticks', async()=>{
  await eosWheelTickTool.handler({parameter_name:'Pan ',ticks:' -2,7 ',mode:'fine'},{});
  expect(sent).toEqual([{address:'/eos/wheel/fine/Pan',args:[{type:'f',value:-2.7}]}]);
 });
 test('uses native continuous speed and rejects percentage ambiguity',async()=>{
  await eosWheelSwitchContinuousTool.handler({parameter_name:'Tilt',rate:120},{});
  expect(sent[0]).toEqual({address:'/eos/switch/Tilt',args:[{type:'f',value:120}]});
  await expect(eosWheelSwitchContinuousTool.handler({parameter_name:'Tilt',rate:'120%'},{})).rejects.toThrow('pourcentage');
  expect(sent).toHaveLength(1);
 });
 test('converts hue and percent notation into two native floats',async()=>{
  await eosSetColorHsTool.handler({hue:'180deg',saturation:'62,5%'},{});
  expect(sent[0]).toEqual({address:'/eos/color/hs',args:[{type:'f',value:180},{type:'f',value:62.5}]});
 });
 test('rejects out-of-range RGB and XY instead of silently clipping',async()=>{
  await expect(eosSetColorRgbTool.handler({red:1,green:0.5,blue:1.2},{})).rejects.toThrow('plage');
  await expect(eosSetPanTiltXYTool.handler({x:0.75,y:1.5},{})).rejects.toThrow('plage');
  expect(sent).toEqual([]);
 });
 test('XYZ supports signed decimal metres and rejects nonnumeric suffixes',async()=>{
  await eosSetXYZPositionTool.handler({x:'2,5',y:'-1.234',z:'0.7777'},{});
  expect(sent[0].args?.map(arg=>arg.value)).toEqual([2.5,-1.234,0.778]);
  await expect(eosSetXYZPositionTool.handler({x:'2.5Delete',y:0,z:0},{})).rejects.toThrow();
 });
});
