"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-neutral-200">500</p>
      <h1 className="mt-4 text-lg font-semibold text-neutral-800">오류가 발생했어요</h1>
      <p className="mt-2 text-sm text-neutral-500">일시적인 문제예요. 잠시 후 다시 시도해주세요.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        다시 시도
      </button>
    </div>
  );
}
