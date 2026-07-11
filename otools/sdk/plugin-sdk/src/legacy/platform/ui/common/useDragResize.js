import { onBeforeUnmount, ref } from 'vue';

const resolveLimit = (value) => (typeof value === 'function' ? value() : value);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const useDragResize = (options) => {
  const dragging = ref(false);
  const state = {
    startX: 0,
    startY: 0,
    startValue: 0,
  };
  let previousCursor = '';
  let activeTarget = null;
  let activePointerId = null;

  const stopDragging = () => {
    if (!dragging.value) return;
    dragging.value = false;
    document.body.style.cursor = previousCursor;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', stopDragging);
    document.removeEventListener('pointercancel', stopDragging);
    document.removeEventListener('lostpointercapture', stopDragging, true);
    if (activeTarget && activePointerId !== null) {
      try {
        if (activeTarget.hasPointerCapture?.(activePointerId)) {
          activeTarget.releasePointerCapture?.(activePointerId);
        }
      } catch {
      }
    }
    activeTarget = null;
    activePointerId = null;
    options.onEnd?.();
  };

  const handlePointerMove = (event) => {
    if (!dragging.value) return;
    const min = resolveLimit(options.min);
    const max = resolveLimit(options.max);
    let nextValue = state.startValue;
    if (options.getValueFromPointer) {
      nextValue = options.getValueFromPointer(event, state);
    } else {
      const delta = options.axis === 'x' ? event.clientX - state.startX : event.clientY - state.startY;
      nextValue = state.startValue + delta;
    }
    options.onChange(clamp(nextValue, min, max));
  };

  const startDragging = (event) => {
    if (event.button !== 0) return;
    dragging.value = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.startValue = options.getInitialValue();
    options.onStart?.(state, event);
    previousCursor = document.body.style.cursor;
    document.body.style.cursor = options.cursor ?? (options.axis === 'x' ? 'col-resize' : 'row-resize');
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', stopDragging);
    document.addEventListener('pointercancel', stopDragging);
    document.addEventListener('lostpointercapture', stopDragging, true);
    const target = event.currentTarget;
    activeTarget = target;
    activePointerId = event.pointerId;
    target?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  onBeforeUnmount(() => {
    stopDragging();
  });

  return {
    dragging,
    startDragging,
  };
};
