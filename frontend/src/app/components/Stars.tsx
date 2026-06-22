"use client";

import { useState } from "react";

type DisplayProps = {
  value: number | null;
  size?: "sm" | "md";
};

type InputProps = DisplayProps & {
  onChange: (next: number | null) => void;
};

const PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z";

function StarSvg({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d={PATH} />
    </svg>
  );
}

export function Stars({ value, size = "md" }: DisplayProps) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  if (value == null) {
    return <span className="text-xs text-neutral-400">미평가</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarSvg key={n} filled={n <= value} className={dim} />
      ))}
    </span>
  );
}

export function StarsInput({ value, onChange, size = "md" }: InputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const dim = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const shown = hover ?? value ?? 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-flex items-center gap-0.5 text-amber-500"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="cursor-pointer rounded transition hover:scale-110"
            aria-label={`${n}점`}
          >
            <StarSvg filled={n <= shown} className={dim} />
          </button>
        ))}
      </span>
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-neutral-400 hover:text-neutral-700"
        >
          지우기
        </button>
      )}
    </span>
  );
}
