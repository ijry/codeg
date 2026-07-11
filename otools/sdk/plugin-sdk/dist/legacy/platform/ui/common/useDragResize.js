import { ref as p, onBeforeUnmount as v } from "vue";
const m = (e) => typeof e == "function" ? e() : e, x = (e, n, r) => Math.min(Math.max(e, n), r), L = (e) => {
  const n = p(!1), r = {
    startX: 0,
    startY: 0,
    startValue: 0
  };
  let c = "", o = null, u = null;
  const a = () => {
    if (n.value) {
      if (n.value = !1, document.body.style.cursor = c, document.removeEventListener("pointermove", i), document.removeEventListener("pointerup", a), document.removeEventListener("pointercancel", a), document.removeEventListener("lostpointercapture", a, !0), o && u !== null)
        try {
          o.hasPointerCapture?.(u) && o.releasePointerCapture?.(u);
        } catch {
        }
      o = null, u = null, e.onEnd?.();
    }
  }, i = (t) => {
    if (!n.value) return;
    const s = m(e.min), g = m(e.max);
    let l = r.startValue;
    if (e.getValueFromPointer)
      l = e.getValueFromPointer(t, r);
    else {
      const f = e.axis === "x" ? t.clientX - r.startX : t.clientY - r.startY;
      l = r.startValue + f;
    }
    e.onChange(x(l, s, g));
  }, d = (t) => {
    if (t.button !== 0) return;
    n.value = !0, r.startX = t.clientX, r.startY = t.clientY, r.startValue = e.getInitialValue(), e.onStart?.(r, t), c = document.body.style.cursor, document.body.style.cursor = e.cursor ?? (e.axis === "x" ? "col-resize" : "row-resize"), document.addEventListener("pointermove", i), document.addEventListener("pointerup", a), document.addEventListener("pointercancel", a), document.addEventListener("lostpointercapture", a, !0);
    const s = t.currentTarget;
    o = s, u = t.pointerId, s?.setPointerCapture?.(t.pointerId), t.preventDefault();
  };
  return v(() => {
    a();
  }), {
    dragging: n,
    startDragging: d
  };
};
export {
  L as useDragResize
};
//# sourceMappingURL=useDragResize.js.map
