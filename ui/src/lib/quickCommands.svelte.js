export const quickCommands = $state({ review: [] });
export const COMMANDS_EVENT = 'prview:commands';
export const CLOSE_FINDERS_EVENT = 'prview:close-finders';
export const FIND_FILE_EVENT = 'prview:find-file';
export const FIND_PR_EVENT = 'prview:find-pr';
export function openQuickCommands(query = '') {
  window.dispatchEvent(new CustomEvent(COMMANDS_EVENT, { detail: { query } }));
}
