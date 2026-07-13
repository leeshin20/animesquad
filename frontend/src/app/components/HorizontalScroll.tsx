"use client";

import { useEffect, useRef, useState } from "react";

export function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  function updateButtons() {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateButtons();
    el.addEventListener("scroll", updateButtons, { passive: true });
    const ro = new ResizeObserver(updateButtons);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      ro.disconnect();
    };
  }, []);

  function scroll(delta: number) {
    ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  const btnClass =
    "absolute top-0 bottom-0 z-10 lg:hidden w-10 items-center justify-center bg-transparent text-white transition hover:bg-black/30 [filter:drop-shadow(0_0_3px_rgba(0,0,0,0.7))]";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll(-176)}
        className={`${btnClass} left-0 ${showLeft ? "flex" : "hidden"}`}
        aria-label="이전"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10,3 5,8 10,13" />
        </svg>
      </button>

      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 lg:grid lg:grid-cols-2 lg:overflow-x-visible lg:pb-0 lg:snap-none"
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => scroll(176)}
        className={`${btnClass} right-0 ${showRight ? "flex" : "hidden"}`}
        aria-label="다음"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6,3 11,8 6,13" />
        </svg>
      </button>
    </div>
  );
}
