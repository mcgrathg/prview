export function reviewShortcutInfo(key, c) {
  let help = '', effect = 'Local navigation', disabledReason = '';
  switch (key) {
    case 'd': help = `Open the ${c.tab === 'files' ? 'conversation' : 'files'} tab.`; break;
    case 'J': help = `Open the next changed file after ${c.file ?? 'the current file'}.`; if (c.index < 0 || c.index >= c.count - 1) disabledReason = 'No next file in the current reading order.'; break;
    case 'K': help = `Open the previous changed file before ${c.file ?? 'the current file'}.`; if (c.index <= 0) disabledReason = 'No previous file in the current reading order.'; break;
    case 'v':
      help = c.tab === 'files' ? `Toggle GitHub Viewed for ${c.file ?? 'the selected file'}. The normal Viewed checkbox still acts immediately.` : 'Focus the review selector; submitting is a separate action.';
      effect = c.tab === 'files' ? 'Personal GitHub change · confirmation required' : 'Opens a draft';
      if (c.tab === 'files' && (!c.file || !c.viewedAllowed)) disabledReason = 'Choose a changed file in the current comparison and wait for GitHub Viewed to load.';
      break;
    case 'c': help = c.tab === 'files' ? 'Choose the commits or comparison range to read.' : 'Focus a new comment draft. Nothing is published.'; break;
    case 'x': help = c.tab === 'files' ? 'Toggle test visibility in this review.' : 'Close the pull request on GitHub after confirmation.'; effect = c.tab === 'files' ? 'Local view' : 'Shared GitHub change · confirmation required'; if (c.tab !== 'files' && !c.live) disabledReason = 'This PR is already closed or merged.'; break;
    case 'h': help = `Read the history of ${c.file ?? 'the selected file'}.`; if (!c.file) disabledReason = 'Select a changed file first.'; break;
    case 'r': help = 'Open a reply draft on the first unresolved thread. Nothing is published.'; effect = 'Opens a draft'; if (!c.reply) disabledReason = 'There are no unresolved review threads to reply to.'; break;
    case 'e': help = `Open an inline draft for ${c.file ?? 'the selected file'}. Publishing is separate.`; effect = 'Opens a draft'; if (!c.editable) disabledReason = 'Use Single view on the current comparison of an open PR, or use the file editor controls.'; break;
    case 'E': help = 'Open the configured desktop editor; changes return for review before committing.'; effect = 'Local editor'; if (!c.desktop) disabledReason = 'External editor requires the desktop app.'; else if (!c.live) disabledReason = 'Editing requires an open PR.'; break;
    case 's': help = 'Choose an assignee; changes made from this shortcut require confirmation.'; effect = 'Picker · shared change on confirmation'; break;
    case 'l': help = 'Choose a label; changes made from this shortcut require confirmation.'; effect = 'Picker · shared change on confirmation'; break;
    case 'q': help = 'Choose a reviewer; confirmation explains the shared change and possible notification.'; effect = 'Picker · shared change on confirmation'; break;
    case 'm': help = `Merge ${c.head} into ${c.base}; this changes the shared base branch.`; effect = 'Shared GitHub change · confirmation required'; disabledReason = !c.live ? 'This pull request is already closed or merged.' : c.mergeReason || ''; break;
    case 'u': help = `Update ${c.head} from ${c.base}; this pushes a shared commit and may run CI.`; effect = 'Shared GitHub change · confirmation required'; if (!c.live || c.updateBusy) disabledReason = 'Branch update is unavailable or already queued.'; break;
    case 'o': help = 'Open the corresponding GitHub page in a new tab.'; break;
    case 'b': help = 'Change your personal saved Cockpit inbox state; no shared GitHub change.'; effect = 'Personal saved change · confirmation required'; break;
    case 't': help = `Switch the local checkout to ${c.head}.`; effect = 'Local files change · confirmation required'; break;
    case 'p': help = 'Open an agent prompt draft. Starting an agent is a separate action.'; effect = 'Opens a draft'; break;
    case 'Escape': help = c.tab === 'files' ? 'Return to the conversation.' : 'Return to your inbox.'; break;
    default: help = 'Run the configured agent or repository action; it can publish comments or change shared code.'; effect = 'Shared changes · confirmation required'; if (!c.live) disabledReason = 'Agents and shared PR actions require an open pull request.';
  }
  if (c.blocked) disabledReason = 'Close the current dialog or picker before using another command.';
  return { help, effect, disabledReason };
}
