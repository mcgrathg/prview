export const REVIEW_FILE_DRAG_EVENT = 'review-file-drag';
let dragging = false;
export const isReviewFileDragging = () => dragging;

// File rows live outside Dockview. Pointer input also works in embedded webviews
// whose HTML5 drag transport cannot carry a tab or file into a panel.
export function beginReviewFileDrag(event, location) {
  if (event.isPrimary === false || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
  const start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  let moved = false;
  const emit = (type, point) => window.dispatchEvent(new CustomEvent(REVIEW_FILE_DRAG_EVENT, { detail: { type, location, x: point.clientX, y: point.clientY } }));
  const move = point => {
    if (point.pointerId !== start.id) return;
    if (!moved && Math.hypot(point.clientX - start.x, point.clientY - start.y) < 7) return;
    moved = dragging = true;
    point.preventDefault();
    emit('move', point);
  };
  const cleanup = () => {
    dragging = false;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', cancel);
    if (moved) {
      const suppress = click => { click.preventDefault(); click.stopImmediatePropagation(); };
      window.addEventListener('click', suppress, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', suppress, true), 0);
    }
  };
  const up = point => { if (point.pointerId !== start.id) return; if (moved) emit('drop', point); cleanup(); };
  const cancel = point => { if (moved) emit('cancel', point); cleanup(); };
  const key = key => { if (key.key === 'Escape') { key.preventDefault(); key.stopImmediatePropagation(); cancel(key); } };
  window.addEventListener('pointermove', move, { capture: true, passive: false });
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('keydown', key, true);
  window.addEventListener('blur', cancel);
}

export function fileDropPosition(rect, x, y) {
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  const nx = (x - rect.left) / rect.width, ny = (y - rect.top) / rect.height;
  if (ny < .2) return 'top';
  if (ny > .8) return 'bottom';
  if (nx < .2) return 'left';
  if (nx > .8) return 'right';
  return 'center';
}
