export const metadata = {
  title: "이용약관 | AnimeSquad",
};

export default function TermsPage() {
  return (
    <div className="prose prose-neutral max-w-3xl text-sm text-neutral-800">
      <h1 className="text-2xl font-bold text-neutral-900">이용약관</h1>
      <p className="text-neutral-500">최종 수정일: 2026년 7월 13일</p>

      <p>
        본 약관은 animesquad(이하 "서비스")와 이용자 간의 권리·의무 및 서비스 이용 조건을 규정합니다.
        서비스에 가입하거나 이용함으로써 본 약관에 동의한 것으로 간주됩니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">1. 서비스 소개</h2>
      <p>
        animesquad는 애니메이션 시청 기록을 관리하고 스쿼드(그룹)와 함께 감상을 공유할 수 있는
        서비스입니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">2. 계정</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>서비스는 Google 계정을 통한 로그인만 지원합니다.</li>
        <li>계정 보안은 이용자 본인이 책임집니다.</li>
        <li>타인의 계정을 무단으로 사용하는 행위는 금지됩니다.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">3. 이용자의 의무</h2>
      <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>타인을 비방·모욕하거나 명예를 훼손하는 콘텐츠 게시</li>
        <li>서비스의 정상적인 운영을 방해하는 행위(스팸, 과도한 요청 등)</li>
        <li>저작권 등 타인의 지식재산권을 침해하는 행위</li>
        <li>불법적인 목적으로 서비스를 이용하는 행위</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">4. 서비스 변경 및 중단</h2>
      <p>
        운영자는 서비스의 내용을 변경하거나 일시 중단할 수 있으며, 이에 대해 별도의 보상을 제공하지 않습니다.
        중요한 변경 사항은 서비스 내 공지 또는 이메일을 통해 안내합니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">5. 면책 조항</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>서비스는 현재 상태 그대로 제공되며, 특정 목적에 대한 적합성을 보증하지 않습니다.</li>
        <li>이용자가 서비스를 통해 얻은 정보의 정확성에 대해 책임을 지지 않습니다.</li>
        <li>이용자 간 분쟁에 대해 운영자는 책임을 지지 않습니다.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">6. 약관 변경</h2>
      <p>
        약관을 변경할 경우 변경 내용을 서비스 내에 공지합니다. 변경 후 계속 이용하면 변경된 약관에 동의한 것으로 봅니다.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">7. 준거법</h2>
      <p>본 약관은 대한민국 법령에 따라 해석·적용됩니다.</p>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900">8. 문의</h2>
      <p>
        약관 관련 문의는{" "}
        <a
          href="mailto:leeshin0213@gmail.com"
          className="underline underline-offset-2 text-neutral-600 hover:text-neutral-900"
        >
          leeshin0213@gmail.com
        </a>
        으로 연락해주세요.
      </p>
    </div>
  );
}
