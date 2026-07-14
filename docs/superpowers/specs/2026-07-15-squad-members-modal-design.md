# 스쿼드 멤버 목록 모달 — 설계

## 배경

스쿼드 상세 페이지에는 "멤버 n명"이라는 텍스트만 있고, 실제로 누가 소속되어 있는지 볼 방법이 없다. "멤버 n명"을 클릭하면 소속 멤버 전체 목록(프로필 사진, 닉네임)을 보여주는 모달을 띄운다. 스쿼드를 만든 사람(OWNER)은 "관리자" 배지로 구분한다.

## 범위

- 스쿼드 멤버 목록 조회 API 추가 (백엔드)
- 멤버 목록 모달 UI 추가 (프론트엔드)
- 멤버 클릭 시 해당 유저 프로필 페이지(`/users/{id}`)로 이동

## 백엔드

### 새 엔드포인트: `GET /api/squad/{id}/members`

- `SquadController`에 추가. 인증된 사용자만 접근 가능 (기존 다른 스쿼드 엔드포인트와 동일한 인증 정책 적용).
- 응답: `List<SquadMemberResponse>`
  - `SquadMemberResponse { Long userId, String displayName, String avatarUrl, MembershipRole role }`
- 정렬: `role == OWNER`인 멤버가 배열 맨 앞에 오도록 정렬. 나머지는 기존 멤버십 조회 순서(가입 시각 등 기존 쿼리 순서) 유지.
- `MembershipRole`은 기존 enum(`OWNER`, `MEMBER`) 그대로 사용. 새로운 role 값 추가 없음.
- 데이터 소스: `MembershipRepository`로 해당 squadId의 멤버십 목록을 조회하고, 각 멤버십의 userId로 `User` 엔티티를 배치 조회하여 `displayName`, `avatarUrl` 조합.

## 프론트엔드

### 타입/API 함수 (`frontend/src/app/lib/api.ts`)

```ts
export type SquadMember = {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "MEMBER";
};
```

`apiGet<SquadMember[]>(`/api/squad/${id}/members`)` 형태로 호출.

### 컴포넌트: `SquadMembersModal.tsx`

- 기존 `SquadEditModal.tsx`의 오버레이 패턴을 따름 (`{ squadId, onClose }` 형태의 props).
- 모달이 열릴 때 멤버 목록을 fetch. 로딩 중에는 간단한 로딩 텍스트 표시.
- 각 멤버 행: 아바타(`avatarUrl ?? "/default-avatar.png"`) + 닉네임. `role === "OWNER"`인 경우 닉네임 옆에 "관리자" 배지 표시.
- 멤버 행 클릭 시 `/users/{userId}`로 이동 (Link 사용).
- 닫기: 배경 클릭 또는 닫기 버튼.

### 트리거 (`squads/[id]/page.tsx:387` 근방)

- 기존 "멤버 {count}명" `<p>` 텍스트를 `<button>`으로 교체.
- 클릭 시 모달 오픈 상태를 true로 설정, `SquadMembersModal` 렌더링.

## 에러 처리

- 멤버 목록 fetch 실패 시 모달 안에 "멤버 목록을 불러오지 못했어요" 문구 표시. 별도 재시도 로직은 추가하지 않음(다시 모달을 닫았다 열면 재요청됨).

## 테스트

- 백엔드: `SquadControllerIT`(또는 기존 통합 테스트 클래스)에 `GET /api/squad/{id}/members` 테스트 추가 — OWNER가 먼저 오는지, 인증 안 된 요청은 거부되는지 확인.
- 프론트엔드: 별도 자동 테스트 없음(기존 프로젝트 컨벤션상 프론트 컴포넌트 단위 테스트가 없음). 타입체크/린트로 검증.
