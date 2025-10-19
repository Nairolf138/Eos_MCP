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

export const cueTools = [
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
];

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
