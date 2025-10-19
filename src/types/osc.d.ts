declare module 'osc' {
  interface UDPPortOptions {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
    metadata?: boolean;
    broadcast?: boolean;
  }

  export class UDPPort {
    constructor(options: UDPPortOptions);
    open(): void;
    close(): void;
    on(event: 'ready', listener: () => void): void;
    on(event: 'message', listener: (oscMessage: unknown) => void): void;
    send(message: unknown, remoteAddress?: string, remotePort?: number): void;
  }
}
