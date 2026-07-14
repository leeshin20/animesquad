# 다른 유저 프로필 보기 + 공개범위 설정 설계

## 배경

피드/스쿼드/애니 상세 페이지 등에서 다른 사람의 프로필 사진이나 닉네임을 눌러도 아무 일도 일어나지 않는다. 다른 사람의 프로필을 볼 수 있게 하고, 친구 기반 서비스 특성에 맞춰 공개범위(전체공개/스쿼드멤버만/비공개)를 사용자가 직접 설정할 수 있게 한다.

## 백엔드 — 공개범위 설정

### 마이그레이션

`backend/src/main/resources/db/migration/V16__profile_visibility.sql` 신규 작성:

```sql
ALTER TABLE users ADD COLUMN profile_visibility VARCHAR(20) NOT NULL DEFAULT 'SQUAD_ONLY';
```

기존 유저는 전부 `SQUAD_ONLY`가 기본값이 된다 (친구 기반 서비스 성격상 보수적인 기본값).

### `User` 엔티티

`ProfileVisibility` enum(`PUBLIC`, `SQUAD_ONLY`, `PRIVATE`)을 `com.animesquad.user` 패키지에 추가하고, `User`에 `profileVisibility` 필드(`@Enumerated(EnumType.STRING)`, 기본값 `SQUAD_ONLY`)와 `updateProfileVisibility(ProfileVisibility)` 메서드를 추가한다.

### `AuthController` / `UserService` 확장

- `MeResponse`에 `profileVisibility` 필드 추가.
- `PATCH /api/me`의 `UpdateProfileRequest`에 `profileVisibility` 필드(nullable)를 추가한다. `displayName`은 기존처럼 필수, `profileVisibility`는 값이 있을 때만 갱신한다 (요청에 하나만 담겨도 되고 둘 다 담겨도 됨).
- `UserService`에 `updateProfileVisibility(Long id, ProfileVisibility v)` 메서드 추가.

## 백엔드 — 다른 유저 프로필 조회

### 신규 엔드포인트: `GET /api/users/{id}`

새 컨트롤러 `UserProfileController` (`com.animesquad.user` 패키지)에 작성.

**접근 가능 여부 판정 로직** (신규 `UserProfileService`에 위치):
- 대상 유저가 없으면 404.
- `accessible = isSelf || target.profileVisibility == PUBLIC || (target.profileVisibility == SQUAD_ONLY && 두 유저가 공유하는 스쿼드가 하나 이상 존재)`
- 공유 스쿼드 판정은 `MembershipRepository.findAllByUserId`로 양쪽의 스쿼드 ID 목록을 가져와 교집합이 있는지 확인한다 (유저당 스쿼드 수가 적으므로 별도 쿼리 없이 서비스 레이어에서 처리).

**응답 (`UserProfileResponse`)**:
```java
record UserProfileResponse(
    Long id,
    String displayName,
    String avatarUrl,
    boolean accessible,
    List<WatchEntryResponse> recentWatched,      // accessible=false면 null
    List<MyEpisodeReviewController.MyEpisodeReview> recentEpisodeReviews, // accessible=false면 null
    List<SquadResponse> squads                   // accessible=false면 null
) {}
```

- `accessible == true`일 때만 `recentWatched`(전체, 최신순 — 프론트에서 슬라이스), `recentEpisodeReviews`(`commentOnly=false`, limit 500, 기존 `MyEpisodeReviewController`의 로직을 재사용), `squads`(`SquadService.listMySquads` 재사용)를 채운다.
- `accessible == false`일 때 세 필드는 전부 `null`.

데이터 조회는 기존에 만들어둔 재사용 가능한 메서드/리포지토리를 그대로 쓴다: `WatchEntryRepository.findAllByUserIdOrderByUpdatedAtDesc`, `EpisodeRatingRepository.findAllByUserIdOrderByUpdatedAtDesc` (Task 1에서 이미 추가됨), `SquadService.listMySquads`.

## 프론트엔드 — API 타입 / 클라이언트

`frontend/src/app/lib/api.ts`:
- `Me` 타입에 `profileVisibility: "PUBLIC" | "SQUAD_ONLY" | "PRIVATE"` 추가.
- `UserProfile` 타입 신규 추가 (백엔드 `UserProfileResponse`와 대응).

## 프론트엔드 — 공개 프로필 페이지

`frontend/src/app/users/[id]/page.tsx` 신규 생성.

- `GET /api/users/{id}` 호출, `accessible`에 따라 분기.
- `accessible == false`: 아바타 + 닉네임만 표시하고 "비공개 프로필이에요" 안내 문구.
- `accessible == true`: 기존 `profile/page.tsx`의 "최근 감상"(`RecentWatchedGrid`), "최근 기록"(`RecentCommentList`), "소속 스쿼드"(`MySquadList`) 렌더링 로직과 동일한 레이아웃을 사용하되, 편집/로그아웃/탈퇴 버튼 없이 읽기 전용으로 표시. 상단에 닉네임 + 아바타만 있고 "프로필 수정" 버튼은 없다.
- 세 렌더링 함수(`RecentWatchedGrid`, `RecentCommentList`, `MySquadList`)와 `RecentComment` 타입은 `profile/page.tsx`에서 export하여 재사용한다 (새 파일에 복붙하지 않음).

## 프론트엔드 — 클릭 진입점

다음 파일들에서 아바타/닉네임을 `<Link href={`/users/${actorId}`}>`로 감싼다:

- `frontend/src/app/components/Timeline.tsx` — 피드 아이템의 아바타 + 이름
- `frontend/src/app/squads/[id]/page.tsx` — 스쿼드장 표시, 멤버별 최근 감상 목록의 아바타
- `frontend/src/app/anime/[id]/page.tsx` — 시리즈 리뷰 목록, 회차 리뷰 목록의 아바타 + 이름 (2곳)

본인 이름을 클릭해도 그냥 `/users/{내 id}`로 이동한다 (본인이므로 `accessible`은 항상 true — 데이터는 전부 보이되 이 페이지에서 수정은 안 됨). 별도 분기 없이 단순하게 처리한다.

## 프론트엔드 — 공개범위 설정 UI

`profile/page.tsx`의 `ProfileEditor` 컴포넌트에 닉네임 입력 아래로 라디오 그룹 추가:
- "전체공개" / "스쿼드 멤버만 공개" / "비공개" 3개 옵션.
- 저장 시 `PATCH /api/me`에 `displayName`과 함께 `profileVisibility`도 전송.

## 테스트

- 백엔드: `UserProfileControllerIT` — PUBLIC/SQUAD_ONLY(같은 스쿼드 있음/없음)/PRIVATE 조합, 본인 조회, 존재하지 않는 유저 404.
- 프론트엔드: 별도 테스트 러너 없음(기존 프로젝트 컨벤션과 동일) — 타입체크 + 브라우저 확인으로 검증.
