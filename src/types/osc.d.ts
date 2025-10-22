declare module 'osc' {
  import type { EventEmitter } from 'events';

  export interface UDPPortOptions {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
    metadata?: boolean;
  }

  export class UDPPort extends EventEmitter {
    constructor(options: UDPPortOptions);
    open(): void;
    close(): void;
    send(message: unknown, remoteAddress?: string, remotePort?: number): void;
    on(event: 'ready', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'message', listener: (message: unknown) => void): this;
    off(event: 'ready', listener: () => void): this;
    off(event: 'close', listener: () => void): this;
    off(event: 'message', listener: (message: unknown) => void): this;
  }

  export function writePacket(
    packet: unknown,
    options?: { metadata?: boolean }
  ): Uint8Array;

  export function readPacket(
    data: ArrayBufferView | ArrayBuffer,
    options?: { metadata?: boolean }
  ): unknown;
}
