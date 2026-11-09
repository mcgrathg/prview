import {roleLabels} from '../../../shared/review-organization/analysis.ts';

const names={attention:'Attention',original:'Original',volume:'Changed lines',flow:'Import flow'};
const groups=[
  'Implementation / configuration / dependency manifests come first.',
  'Tests follow implementation / configuration / dependency manifests.',
  'Documentation follows implementation and tests.',
  'Other files follow documentation.',
  'Snapshots / fixtures / lockfiles: supporting data comes last.',
];

function adjacentReason(entry, entries, order) {
  const next=entries[entry.rank],previous=entries[entry.rank-2];
  const peer=next ?? previous;
  if(!peer)return null;
  const ahead=Boolean(next),file=entry.file,other=peer.file;
  const prefix=`${ahead ? 'Ahead of' : 'Behind'} ${other.name} (#${peer.rank}): `;
  if(order==='attention' && file.attentionTier!==other.attentionTier)return prefix+(ahead ? 'this role group comes first.' : 'its role group comes first.');
  if(order==='attention' && file.hasControlFlowChange!==other.hasControlFlowChange)return prefix+(ahead ? 'added control-flow text detected here.' : 'it has added control-flow text.');
  if(file.changes!==other.changes)return prefix+`${file.changes.toLocaleString()} vs ${other.changes.toLocaleString()} changed lines.`;
  return prefix+'file path breaks an otherwise exact tie.';
}

export function explainReviewOrder(entry, entries, order) {
  const file=entry.file;
  const lines=[`${names[order] ?? 'Review'} rank #${entry.rank} of ${entries.length} changed files (before filters/grouping).`];
  const size=`${file.changes.toLocaleString()} changed lines (+${file.additions.toLocaleString()} −${file.deletions.toLocaleString()}).`;
  if(order==='original')return [...lines,'Captured PR file order; no Attention reordering.',size];
  if(order==='volume')return [...lines,size,adjacentReason(entry,entries,order),'More changed lines first; file path breaks ties.'].filter(Boolean);
  if(order==='flow')return [...lines,'Importers before changed modules they import. Unrelated paths and cycles use Attention as the baseline.',size,'Changed paths only; not a complete call graph.'];
  const roles=file.roles.map(role=>roleLabels[role]).join(', ');
  const signal=file.hasControlFlowChange ? 'Added if / throw / catch / assert text: prioritized within this role group.'
    : !file.roles.includes('source') ? 'Added control-flow text is checked in source files only.'
    : file.patch===null ? 'Patch unavailable; added control-flow text could not be checked.' : 'No added control-flow text boost.';
  return [...lines,`${roles}. ${groups[file.attentionTier]}`,signal,size,adjacentReason(entry,entries,order),
    'Within each role group: added control-flow text, then more changed lines, then file path.',
    'Not a risk score; text matches can include comments or strings.'].filter(Boolean);
}
