export function reviewInsightSummary(file) {
  if(!file)return null;
  const reasons=[];
  if(file.complexityIncreased && file.complexity.status==='ok'){
    const changes=file.complexity.changes.filter(change=>change.delta>0);
    reasons.push(`Complexity increased${changes.length ? ': '+changes.slice(0,3).map(change=>`${change.name}: ${change.base.complexity} → ${change.head.complexity} (+${change.delta})`).join('; ')+(changes.length>3?`; ${changes.length-3} more functions`:'') : ''}`);
  }
  if(file.newCycle)reasons.push('New import cycle in the resolved changed-file graph');
  if(file.activity.status==='ok' && file.activity.count>=5)reasons.push(`Recent activity: ${file.activity.count} observed commits in the bounded base-history sample`);
  return reasons.length ? {count:reasons.length,title:[`${reasons.length} review observation${reasons.length===1?'':'s'} · Open Insights`,...reasons,'Observations, not a risk score.'].join('\n')} : null;
}
