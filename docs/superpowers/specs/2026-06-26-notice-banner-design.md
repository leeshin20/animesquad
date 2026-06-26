# 공지 배너 (Notice Banner) 설계

날짜: 2026-06-26

## 목표
메인 페이지와 스쿼드 피드 최상단(내비게이션 바 아래)에 공지 배너를 추가한다.
- 메인: 앱 업데이트 공지 (개발자 관리)
- 스쿼드: 스쿼드 소유자가 올리는 공지 (재배포 없이 수정)

## 결정 사항
- **메인 공지 = 코드 상수**: `lib/notice.ts`의 `MAIN_NOTICE`. 비어 있으면 배너 미표시. 백엔드 없음.
- **스쿼드 공지 = DB 저장, 현재 공지 1개**: `squad.announcement` 컬럼(nullable). 수정 시 덮어쓰기, 이력 없음.
- **권한**: 스쿼드 **소유자(`ownerId`)** 만 작성/수정. (별도 admin 역할 없음)
- **표시**: 공통 `NoticeBanner` 컴포넌트로 스타일 통일. 닫기(dismiss) 없음 (MVP).

## 백엔드
- Flyway `V9__squad_announcement.sql`: `ALTER TABLE squad ADD COLUMN announcement TEXT;`
- `Squad` 엔티티: `announcement` 필드 + `updateAnnouncement(String)` (빈 문자열→null)
- `SquadResponse`: `announcement` 포함
- `SquadService.updateAnnouncement(userId, squadId, text)`: 멤버십·존재 확인 후 `ownerId != userId`면 403(`ResponseStatusException`), 아니면 저장
- `SquadController`: `PATCH /api/squad/{id}/announcement`, body `{ announcement }` → `SquadResponse`

## 프론트엔드
- `Squad` 타입에 `announcement: string | null` 추가
- `components/NoticeBanner.tsx`: 스타일된 배너 컨테이너 (children 표시)
- `lib/notice.ts`: `MAIN_NOTICE` 상수
- 메인(`page.tsx` Dashboard): 최상단에 `MAIN_NOTICE` 배너 (있을 때만)
- 스쿼드(`squads/[id]/page.tsx`): 최상단 공지 배너
  - 공지 있으면 모든 멤버에게 표시
  - 소유자면 수정 버튼(인라인 textarea 편집·저장); 공지 없으면 소유자에게 "공지 작성" 안내
  - 소유자 판별 위해 `/api/me` 호출 추가

## 테스트
- `SquadControllerIT`: 소유자 공지 설정 성공 + 응답 반영, 비소유자 403, 빈 값→공지 삭제
- 프론트: `npm run build` 통과
