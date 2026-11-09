export function reviewMode(search) {
  const params = new URLSearchParams(search);
  const enhanced = params.get('legacy') !== '1';
  return { enhanced, investigations: enhanced && params.get('investigate') === '1' };
}
