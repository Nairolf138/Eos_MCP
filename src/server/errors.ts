export enum ErrorCode {
  MCP_STARTUP_FAILURE = 'MCP_STARTUP_FAILURE',
  OSC_TIMEOUT = 'OSC_TIMEOUT',
  OSC_CONNECTION_LOST = 'OSC_CONNECTION_LOST',
  VALIDATION_OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.MCP_STARTUP_FAILURE]: 'Erreur lors du demarrage du serveur MCP.',
  [ErrorCode.OSC_TIMEOUT]: "L'operation a expire avant la reponse de la console OSC.",
  [ErrorCode.OSC_CONNECTION_LOST]: 'La connexion OSC a ete perdue.',
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: 'La valeur fournie est hors de la plage autorisee.',
  [ErrorCode.VALIDATION_ERROR]: 'Les arguments fournis sont invalides.'
};

export type ErrorDetails = Record<string, unknown>;

export interface ErrorOptions {
  message?: string;
  details?: ErrorDetails;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;

  public readonly details?: ErrorDetails;

  public readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, options: ErrorOptions = {}) {
    super(message);
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
    this.name = 'AppError';
  }
}

export function createError(code: ErrorCode, options: ErrorOptions = {}): AppError {
  const message = options.message ?? DEFAULT_MESSAGES[code];
  return new AppError(code, message, options);
}

export function createTimeoutError(
  operation: string,
  timeoutMs: number,
  message?: string,
  details: ErrorDetails = {}
): AppError {
  const suffix = message ? ` ${message}` : " La console n'a pas repondu a temps.";
  const extendedDetails: ErrorDetails = { ...details, operation, timeoutMs };
  if (message) {
    extendedDetails.reason = message;
  }
  return createError(ErrorCode.OSC_TIMEOUT, {
    message: `L'operation ${operation} a expire apres ${timeoutMs} ms.${suffix}`,
    details: extendedDetails
  });
}

export function createConnectionLostError(
  operation: string,
  details: ErrorDetails = {}
): AppError {
  const rawMessage = (details.message && typeof details.message === 'string' ? details.message : '').trim();
  const suffix = rawMessage.length > 0 ? `: ${rawMessage}` : '.';
  const extendedDetails: ErrorDetails = { ...details, operation };
  if (rawMessage) {
    extendedDetails.reason = rawMessage;
  }
  return createError(ErrorCode.OSC_CONNECTION_LOST, {
    message: `Connexion OSC perdue pendant ${operation}${suffix}`,
    details: extendedDetails
  });
}

export function createOutOfRangeError(
  field: string,
  value: number,
  min: number,
  max: number,
  details: ErrorDetails = {}
): AppError {
  return createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
    message: `La valeur ${value} pour ${field} doit etre comprise entre ${min} et ${max}.`,
    details: { ...details, field, value, min, max }
  });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

interface NormaliseOptions {
  code: ErrorCode;
  message?: string;
  details?: ErrorDetails;
}

export function toAppError(error: unknown, options: NormaliseOptions): AppError {
  if (isAppError(error)) {
    return error;
  }

  const baseDetails: ErrorDetails = { ...options.details };
  if (error && typeof error === 'object') {
    baseDetails.originalError = error;
  } else {
    baseDetails.originalError = { value: error };
  }

  const message = options.message ?? DEFAULT_MESSAGES[options.code];
  return new AppError(options.code, message, { details: baseDetails, cause: error });
}

export function describeError(error: AppError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    details: error.details
  };
}
