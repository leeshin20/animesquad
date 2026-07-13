"use client";

import { useRef } from "react";

export function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  function scroll(delta: number) {
    ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  const btnClass =
    "absolute top-1/2 -translate-y-1/2 z-10 hidden md:flex lg:hidden h-8 w-8 items-center justify-center rounded-full bg-white border border-neutral-200 shadow text-neutral-600 hover:bg-neutral-50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll(-176)}
        className={`${btnClass} -left-4`}
        aria-label="이전"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,2 4,7 9,12" />
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
        className={`${btnClass} -right-4`}
        aria-label="다음"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5,2 10,7 5,12" />
        </svg>
      </button>
    </div>
  );
}
