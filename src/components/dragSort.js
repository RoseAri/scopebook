// Drag-to-reorder for vertical lists. Works with mouse, touch and pen (pointer events),
// so clients on phones can reorder too. Arrow keys on the handle move an item as well.
//
//   const drag = useDragSort((from, to) => ...move item...);
//   <ol ref={drag.listRef}>
//     <li data-sort-item className={drag.index === i ? 'dragging' : ''}>
//       <button {...drag.handleProps(i)} />
import { useEffect, useRef, useState } from 'react';

const EDGE = 64; // px from the window edge where the page starts scrolling
const SCROLL_STEP = 14;

export function useDragSort(onMove) {
  const listRef = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const active = useRef(null);
  const [index, setIndex] = useState(null);

  const items = () => (listRef.current ? [...listRef.current.querySelectorAll(':scope > [data-sort-item]')] : []);

  const moveTo = (to) => {
    const s = active.current;
    if (!s || to === s.index) return;
    onMoveRef.current(s.index, to);
    s.index = to;
    setIndex(to);
  };

  const track = (y) => {
    const s = active.current;
    if (!s) return;
    const list = items();
    let to = s.index;
    // Step one place at a time once the pointer passes a neighbour's midpoint.
    while (to > 0) {
      const r = list[to - 1].getBoundingClientRect();
      if (y < r.top + r.height / 2) to -= 1;
      else break;
    }
    while (to < list.length - 1) {
      const r = list[to + 1].getBoundingClientRect();
      if (y > r.top + r.height / 2) to += 1;
      else break;
    }
    moveTo(to);
  };

  const end = () => {
    const s = active.current;
    if (!s) return;
    active.current = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('pointermove', s.move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    document.body.classList.remove('is-dragging');
    setIndex(null);
  };

  useEffect(() => end, []);

  const start = (e, i) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    end();
    const s = { index: i, y: e.clientY, raf: 0 };
    s.move = (ev) => {
      ev.preventDefault();
      s.y = ev.clientY;
      track(s.y);
    };
    // Scroll the page while the pointer rests near the top or bottom edge.
    const tick = () => {
      if (active.current !== s) return;
      if (s.y < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (s.y > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      if (s.y < EDGE || s.y > window.innerHeight - EDGE) track(s.y);
      s.raf = requestAnimationFrame(tick);
    };
    active.current = s;
    window.addEventListener('pointermove', s.move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.body.classList.add('is-dragging');
    s.raf = requestAnimationFrame(tick);
    setIndex(i);
  };

  const handleProps = (i, label) => ({
    type: 'button',
    className: 'drag-handle',
    'aria-label': label,
    title: label,
    onPointerDown: (e) => start(e, i),
    onKeyDown: (e) => {
      const n = items().length;
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
      if (to === null || to < 0 || to >= n) return;
      e.preventDefault();
      onMoveRef.current(i, to);
      const target = e.currentTarget;
      requestAnimationFrame(() => target.focus());
    },
    children: '⠿',
  });

  return { listRef, index, handleProps };
}

/** Move one item from `from` to `to`. */
export function arrayMove(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
