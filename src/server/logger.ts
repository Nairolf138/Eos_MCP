import pino, {
  stdTimeFunctions,
  multistream,
  type DestinationStream,
  type Logger
} from 'pino';
import { config, type LoggingDestination } from '../config/index';

function createDestinationStream(destination: LoggingDestination): DestinationStream {
  switch (destination.type) {
    case 'stdout':
      if (config.logging.format === 'pretty') {
        return pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard'
          }
        });
      }

      return pino.destination({ dest: process.stdout.fd, sync: false });
    case 'file':
      return pino.transport({
        target: 'pino/file',
        options: {
          destination: destination.path,
          mkdir: true
        }
      });
    case 'transport':
      return pino.transport({
        target: destination.target,
        options: destination.options
      });
    default: {
      const exhaustiveCheck: never = destination;
      return exhaustiveCheck;
    }
  }
}

const destinationStreams = config.logging.destinations.map((destination) => ({
  stream: createDestinationStream(destination)
}));

const destination: DestinationStream =
  destinationStreams.length === 1
    ? destinationStreams[0]!.stream
    : multistream(destinationStreams);

const baseLogger: Logger = pino(
  {
    level: config.logging.level,
    base: undefined,
    timestamp: stdTimeFunctions.isoTime
  },
  destination
);

export function getLogger(): Logger {
  return baseLogger;
}

export function createLogger(scope: string): Logger {
  return baseLogger.child({ scope });
}

export type { Logger };
