/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import eosCueFireTool from './fire';
import eosCueGoTool from './go';
import eosCueStopBackTool from './stop_back';
import eosCueSelectTool from './select';
import eosCueGetInfoTool from './get_info';
import eosCueListAllTool from './list_all';
import eosCuelistGetInfoTool from './cuelist_get_info';
import eosCuelistBankCreateTool from './cuelist_bank_create';
import eosCuelistBankPageTool from './cuelist_bank_page';
import eosGetActiveCueTool from './get_active_cue';
import eosGetPendingCueTool from './get_pending_cue';
import { withToolMetadata } from '../types';

export const cueTools = withToolMetadata([
  eosCueFireTool,
  eosCueGoTool,
  eosCueStopBackTool,
  eosCueSelectTool,
  eosCueGetInfoTool,
  eosCueListAllTool,
  eosCuelistGetInfoTool,
  eosCuelistBankCreateTool,
  eosCuelistBankPageTool,
  eosGetActiveCueTool,
  eosGetPendingCueTool
], {
  category: 'cues',
  synonyms: ['cue', 'cuelist', 'playback', 'go', 'record cue'],
  riskLevel: 'high',
  requiresConfirmation: true,
  preferredWorkflow: ['eos_workflow_create_cue_series', 'eos_workflow_update_cue_look']
});

export default cueTools;

export {
  eosCueFireTool,
  eosCueGoTool,
  eosCueStopBackTool,
  eosCueSelectTool,
  eosCueGetInfoTool,
  eosCueListAllTool,
  eosCuelistGetInfoTool,
  eosCuelistBankCreateTool,
  eosCuelistBankPageTool,
  eosGetActiveCueTool,
  eosGetPendingCueTool
};
