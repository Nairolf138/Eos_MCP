import type { AddressInfo } from 'node:net';
import { buildHttpAccessDetails } from '../index';

describe('buildHttpAccessDetails', () => {
  it('normalise une adresse IPv4 generique vers localhost en HTTP', () => {
    const address = { address: '0.0.0.0', family: 'IPv4', port: 8080 } as AddressInfo;
    const result = buildHttpAccessDetails(address, { MCP_TLS_ENABLED: 'false' });

    expect(result).toEqual({
      host: 'localhost',
      protocol: 'http',
      accessUrl: 'http://localhost:8080'
    });
  });

  it('normalise une adresse IPv6 et active le protocole HTTPS', () => {
    const address = { address: '2001:db8::1', family: 'IPv6', port: 7443 } as AddressInfo;
    const result = buildHttpAccessDetails(address, { MCP_TLS_ENABLED: 'true' });

    expect(result).toEqual({
      host: '[2001:db8::1]',
      protocol: 'https',
      accessUrl: 'https://[2001:db8::1]:7443'
    });
  });

  it('reconnaît les alias TLS supplementaires et preserve localhost en IPv6', () => {
    const address = { address: 'localhost', family: 'IPv6', port: 9000 } as AddressInfo;
    const result = buildHttpAccessDetails(address, { MCP_TLS: 'ENABLED' });

    expect(result).toEqual({
      host: 'localhost',
      protocol: 'https',
      accessUrl: 'https://localhost:9000'
    });
  });
});
