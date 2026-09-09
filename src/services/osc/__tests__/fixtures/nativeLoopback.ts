/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createSocket } from 'node:dgram';
import { createServer, type Socket } from 'node:net';
import osc from 'osc';
import type { OscMessage } from '../../index';
import { replyToNativeRequest } from './nativePeer';

/** Synthetic protocol peer on real loopback UDP/TCP sockets. No Eos CLI emulation. */
export class NativeLoopbackPeer {
  private udp = createSocket('udp4');
  private tcp = createServer();
  private sockets = new Set<Socket>();
  public udpPort = 0;
  public tcpPort = 0;
  public received: Array<{ transport: 'udp' | 'tcp'; message: OscMessage }> = [];
  public respond = replyToNativeRequest;
  public async start() {
    this.udp.on('message', (buffer, remote) => {
      const message = osc.readPacket(buffer, { metadata: true }) as OscMessage;
      this.received.push({ transport: 'udp', message });
      for (const response of this.respond(message)) this.udp.send(Buffer.from(osc.writePacket(response, { metadata: true })), remote.port, remote.address);
    });
    this.tcp.on('connection', (socket) => {
      this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', () => {});
      let buffer: Buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32BE(0)) {
          const length = buffer.readUInt32BE(0);
          const message = osc.readPacket(buffer.subarray(4,4+length), { metadata:true }) as OscMessage;
          buffer = buffer.subarray(4+length);
          this.received.push({ transport:'tcp', message });
          for (const response of this.respond(message)) {
            const payload = Buffer.from(osc.writePacket(response,{metadata:true}));
            const prefix = Buffer.alloc(4); prefix.writeUInt32BE(payload.length);
            const packet = Buffer.concat([prefix,payload]);
            socket.write(packet.subarray(0,3)); socket.write(packet.subarray(3,11)); socket.write(packet.subarray(11));
          }
        }
      });
    });
    await Promise.all([
      new Promise<void>((resolve,reject)=>{ this.udp.once('error',reject); this.udp.bind(0,'127.0.0.1',()=>{this.udp.off('error',reject);this.udpPort=this.udp.address().port;resolve();}); }),
      new Promise<void>((resolve,reject)=>{ this.tcp.once('error',reject); this.tcp.listen(0,'127.0.0.1',()=>{this.tcp.off('error',reject);const address=this.tcp.address();if(address && typeof address!=='string')this.tcpPort=address.port;resolve();}); })
    ]);
  }
  public async close() {
    for (const socket of this.sockets) socket.destroy();
    await Promise.all([new Promise<void>((resolve)=>this.udp.close(()=>resolve())),new Promise<void>((resolve)=>this.tcp.close(()=>resolve()))]);
  }
}
