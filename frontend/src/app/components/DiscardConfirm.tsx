"use client";

// Shown when the user tries to dismiss a modal that has unsaved input.
export function DiscardConfirm({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xs rounded-lg bg-white p-5 shadow-xl">
        <p className="text-sm text-neutral-700">작성 중인 내용이 삭제됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            계속 작성하기
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
