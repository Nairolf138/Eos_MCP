import pino, {
  stdTimeFunctions,
  multistream,
  type DestinationStream,
  type Logger
} from 'pino';
import type { AppConfig, LoggingDestination } from '../config/index';

type LoggerFactory = () => Logger;

let baseLogger: Logger = pino(
  {
    base: undefined,
    timestamp: stdTimeFunctions.isoTime
  },
  pino.destination({ dest: process.stderr.fd, sync: false })
);

function createDestinationStream(
  destination: LoggingDestination,
  format: AppConfig['logging']['format']
): DestinationStream {
  const createStdioDestination = (): DestinationStream => {
    if (format === 'pretty') {
      return pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          destination: process.stderr.fd
        }
      });
    }

    return pino.destination({ dest: process.stderr.fd, sync: false });
  };

  switch (destination.type) {
    case 'stdout':
      return createStdioDestination();
    case 'stderr':
      return createStdioDestination();
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

function createBaseLogger(config: AppConfig): Logger {
  const destinationStreams = config.logging.destinations.map((destination) => ({
    stream: createDestinationStream(destination, config.logging.format)
  }));

  const destination: DestinationStream =
    destinationStreams.length === 1
      ? destinationStreams[0]!.stream
      : multistream(destinationStreams);

  return pino(
    {
      level: config.logging.level,
      base: undefined,
      timestamp: stdTimeFunctions.isoTime
    },
    destination
  );
}

function createLoggerProxy(factory: LoggerFactory): Logger {
  return new Proxy(
    {},
    {
      get(_target, property, receiver) {
        const target = factory();
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    }
  ) as Logger;
}

export function initialiseLogger(config: AppConfig): void {
  baseLogger = createBaseLogger(config);
}

const rootLogger = createLoggerProxy(() => baseLogger);

export function getLogger(): Logger {
  return rootLogger;
}

export function createLogger(scope: string): Logger {
  return createLoggerProxy(() => baseLogger.child({ scope }));
}

export type { Logger };
