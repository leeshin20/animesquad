export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-mark.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    />
  );
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[9px] text-base font-semibold tracking-tight ${className}`}>
      <BrandMark />
      <span>AnimeSquad</span>
    </span>
  );
}
