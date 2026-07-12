import Link from "next/link";

export const metadata = {
  title: "페이지를 찾을 수 없어요 | AnimeSquad",
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-neutral-200">404</p>
      <h1 className="mt-4 text-lg font-semibold text-neutral-800">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-sm text-neutral-500">주소가 잘못됐거나 삭제된 페이지예요.</p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        홈으로
      </Link>
    </div>
  );
}
