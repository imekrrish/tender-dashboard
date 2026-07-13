import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FloatingMenuProps {
  anchorRef: React.RefObject<any>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  matchWidth?: boolean;
  align?: 'left' | 'right';
  maxHeight?: number;
}

/**
 * A dropdown surface rendered in a portal at the document root, positioned
 * against a trigger element. Because it escapes the DOM it never gets clipped
 * by scrolling ancestors (sidebar, drawer), and it flips upward automatically
 * when there isn't room below.
 */
export const FloatingMenu: React.FC<FloatingMenuProps> = ({
  anchorRef,
  open,
  onClose,
  children,
  matchWidth = true,
  align = 'left',
  maxHeight = 300,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const compute = () => {
    const el = anchorRef.current as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    // clientWidth/Height exclude the scrollbar, so we never position under it
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < maxHeight + gap && spaceAbove > spaceBelow;
    const avail = (openUp ? spaceAbove : spaceBelow) - gap - margin;

    // Width: match the trigger but never wider than the viewport
    const width = Math.min(matchWidth ? r.width : Math.max(r.width, 160), vw - margin * 2);

    const next: React.CSSProperties = {
      position: 'fixed',
      zIndex: 80,
      width,
      maxHeight: Math.max(160, Math.min(maxHeight, avail)),
      opacity: 1,
      transformOrigin: openUp ? 'bottom left' : 'top left',
    };

    // Horizontal: prefer aligning to the trigger, then clamp fully on-screen
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(margin, Math.min(left, vw - width - margin));
    next.left = left;

    if (openUp) next.bottom = vh - r.top + gap;
    else next.top = r.bottom + gap;

    setStyle(next);
  };

  useLayoutEffect(() => {
    if (open) compute();
    else setStyle({ opacity: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => compute();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if ((anchorRef.current as HTMLElement | null)?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div ref={menuRef} style={style} className="animate-pop">
      <div
        className="bg-white rounded-xl shadow-pop ring-1 ring-line overflow-hidden flex flex-col"
        style={{ maxHeight: style.maxHeight }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
