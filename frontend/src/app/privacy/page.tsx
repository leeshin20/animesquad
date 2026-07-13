export const metadata = {
  title: "개인정보처리방침 | AnimeSquad",
};

export default function PrivacyPage() {
  return (
    <div className="prose prose-neutral max-w-3xl text-sm text-neutral-800">
      <h1 className="text-2xl font-bold text-neutral-900">개인정보처리방침</h1>
      <p className="text-neutral-500">최종 수정일: 2026년 7월 13일</p>

      <p>
        animesquad(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 소중히 여기며, 개인정보보호법 등 관련 법령을 준수합니다.
        본 방침은 서비스가 어떤 정보를 수집하고 어떻게 이용하는지 안내합니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">1. 수집하는 개인정보 항목</h2>
      <p>서비스는 Google 로그인을 통해 다음 정보를 수집합니다.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>이메일 주소</li>
        <li>닉네임(표시 이름)</li>
        <li>프로필 사진 URL</li>
      </ul>
      <p className="mt-2">서비스 이용 과정에서 다음 정보가 생성·저장됩니다.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>애니메이션 시청 기록(상태, 진도, 점수, 감상 코멘트)</li>
        <li>회차별 감상 기록</li>
        <li>스쿼드 참여 정보</li>
        <li>이용자가 직접 업로드한 프로필 사진</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">2. 개인정보 수집 및 이용 목적</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>회원 식별 및 로그인 처리</li>
        <li>애니메이션 시청 기록·감상 기능 제공</li>
        <li>스쿼드(그룹) 서비스 제공</li>
        <li>서비스 운영 및 개선</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">3. 보유 및 이용 기간</h2>
      <p>
        수집된 개인정보는 회원 탈퇴 시 즉시 삭제됩니다. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관됩니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">4. 개인정보의 제3자 제공</h2>
      <p>
        서비스는 이용자의 개인정보를 외부에 제공하지 않습니다. 단, Google 로그인은 Google의{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 text-neutral-600 hover:text-neutral-900"
        >
          개인정보처리방침
        </a>
        에 따라 처리됩니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">5. 개인정보처리 위탁</h2>
      <p>서비스는 원활한 운영을 위해 아래 업체에 인프라를 위탁합니다.</p>
      <table className="w-full text-sm border-collapse mt-2">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left py-2 font-medium text-neutral-700">수탁사</th>
            <th className="text-left py-2 font-medium text-neutral-700">위탁 업무</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-100">
            <td className="py-2">Google LLC</td>
            <td className="py-2">소셜 로그인 인증</td>
          </tr>
          <tr className="border-b border-neutral-100">
            <td className="py-2">Vercel Inc.</td>
            <td className="py-2">웹 서비스 호스팅</td>
          </tr>
          <tr className="border-b border-neutral-100">
            <td className="py-2">Render Services Inc.</td>
            <td className="py-2">백엔드 서버 호스팅</td>
          </tr>
          <tr>
            <td className="py-2">Cloudflare Inc.</td>
            <td className="py-2">파일 저장(프로필 사진) 및 CDN</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">6. 이용자의 권리</h2>
      <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>개인정보 열람 및 수정: 프로필 페이지에서 직접 변경 가능</li>
        <li>개인정보 삭제(회원 탈퇴): 프로필 페이지 → 회원 탈퇴</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">7. 개인정보보호 책임자</h2>
      <p>개인정보 관련 문의는 아래로 연락해주세요.</p>
      <ul className="list-none pl-0 space-y-1">
        <li><span className="font-medium">운영자:</span> animesquad</li>
        <li>
          <span className="font-medium">이메일:</span>{" "}
          <a
            href="mailto:leeshin0213@gmail.com"
            className="underline underline-offset-2 text-neutral-600 hover:text-neutral-900"
          >
            leeshin0213@gmail.com
          </a>
        </li>
      </ul>
    </div>
  );
}
