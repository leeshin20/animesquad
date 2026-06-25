import type { WatchStatus } from "@/app/lib/api";

export const STATUSES: WatchStatus[] = [
  "WATCHING", "COMPLETED", "ON_HOLD", "DROPPED", "PLAN_TO_WATCH",
];

export const STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "보는 중",
  COMPLETED: "완료",
  ON_HOLD: "보류",
  DROPPED: "중단",
  PLAN_TO_WATCH: "볼 예정",
};

// Button styles (border + bg + text + hover) per status — used on action buttons.
export const STATUS_STYLE: Record<WatchStatus, string> = {
  WATCHING: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  ON_HOLD: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  DROPPED: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  PLAN_TO_WATCH: "border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100",
};

// Badge styles (bg + text only) per status — used on inline feed badges.
export const STATUS_BADGE: Record<WatchStatus, string> = {
  WATCHING: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  DROPPED: "bg-rose-50 text-rose-700",
  PLAN_TO_WATCH: "bg-neutral-100 text-neutral-600",
};

// Safe lookups for raw values coming from feed payloads (unknown/string).
export function statusLabel(v: unknown): string {
  return STATUS_LABEL[v as WatchStatus] ?? String(v);
}

export function statusBadge(v: unknown): string {
  return STATUS_BADGE[v as WatchStatus] ?? "bg-neutral-100 text-neutral-600";
}
