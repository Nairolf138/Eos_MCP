import { EventEmitter } from 'node:events';
import type { TransportStatus, TransportType } from './connectionManager';

export type OscConnectionHealth = 'online' | 'degraded' | 'offline';

export interface OscConnectionOverview {
  health: OscConnectionHealth;
  transports: Record<TransportType, TransportStatus>;
  updatedAt: number;
}

type OscConnectionStateEvents = {
  update: [OscConnectionOverview];
};

function cloneStatus(status: TransportStatus): TransportStatus {
  return {
    type: status.type,
    state: status.state,
    lastHeartbeatSentAt: status.lastHeartbeatSentAt,
    lastHeartbeatAckAt: status.lastHeartbeatAckAt,
    consecutiveFailures: status.consecutiveFailures
  };
}

function createInitialStatus(type: TransportType): TransportStatus {
  return {
    type,
    state: 'disconnected',
    lastHeartbeatAckAt: null,
    lastHeartbeatSentAt: null,
    consecutiveFailures: 0
  };
}

export class OscConnectionStateProvider extends EventEmitter {
  private readonly transports: Record<TransportType, TransportStatus> = {
    tcp: createInitialStatus('tcp'),
    udp: createInitialStatus('udp')
  };

  private updatedAt = Date.now();

  public override on<Event extends keyof OscConnectionStateEvents>(
    event: Event,
    listener: (...args: OscConnectionStateEvents[Event]) => void
  ): this {
    return super.on(event, listener);
  }

  public override once<Event extends keyof OscConnectionStateEvents>(
    event: Event,
    listener: (...args: OscConnectionStateEvents[Event]) => void
  ): this {
    return super.once(event, listener);
  }

  public override off<Event extends keyof OscConnectionStateEvents>(
    event: Event,
    listener: (...args: OscConnectionStateEvents[Event]) => void
  ): this {
    return super.off(event, listener);
  }

  public setStatus(status: TransportStatus): void {
    const previous = this.transports[status.type];
    const next = cloneStatus(status);
    if (
      previous.state === next.state &&
      previous.lastHeartbeatAckAt === next.lastHeartbeatAckAt &&
      previous.lastHeartbeatSentAt === next.lastHeartbeatSentAt &&
      previous.consecutiveFailures === next.consecutiveFailures
    ) {
      return;
    }

    this.transports[status.type] = next;
    this.updatedAt = Date.now();
    this.emit('update', this.getOverview());
  }

  public getStatus(type: TransportType): TransportStatus {
    return cloneStatus(this.transports[type]);
  }

  public getOverview(): OscConnectionOverview {
    const transports: Record<TransportType, TransportStatus> = {
      tcp: this.getStatus('tcp'),
      udp: this.getStatus('udp')
    };

    return {
      health: this.computeHealth(transports),
      transports,
      updatedAt: this.updatedAt
    };
  }

  private computeHealth(
    transports: Record<TransportType, TransportStatus>
  ): OscConnectionHealth {
    const states = Object.values(transports).map((transport) => transport.state);
    const allConnected = states.every((state) => state === 'connected');
    if (allConnected) {
      return 'online';
    }

    const hasActiveTransport = states.some((state) => state === 'connected' || state === 'connecting');
    if (hasActiveTransport) {
      return 'degraded';
    }

    return 'offline';
  }
}
