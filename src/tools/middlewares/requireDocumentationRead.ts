import { hasSessionReadManual } from '../../resources/manualReadTracker';
import type { ToolMiddleware } from '../types';

interface ToolExtraWithSessionId {
  sessionId?: string;
}

const requireDocumentationRead: ToolMiddleware = async (context, next) => {
  const sessionId = (context.extra as ToolExtraWithSessionId | undefined)?.sessionId;

  if (!hasSessionReadManual(sessionId)) {
    const instructions = [
      `Consultation requise avant d'utiliser l'outil "${context.name}".`,
      'Merci de lire ou d\'ouvrir :',
      '- manual://eos',
      `- schema://tools/${context.name}`,
      '- resource://cookbook'
    ].join('\n');

    throw new Error(instructions);
  }

  return next();
};

export default requireDocumentationRead;
