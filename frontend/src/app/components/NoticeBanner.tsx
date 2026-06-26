/** Styled notice banner shown at the top of a page, below the nav bar. */
export function NoticeBanner({
  label = "공지",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded bg-amber-200/70 px-1.5 py-0.5 text-xs font-semibold">
          {label}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
