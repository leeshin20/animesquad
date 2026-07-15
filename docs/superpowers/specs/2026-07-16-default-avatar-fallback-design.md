# 기본 사용자 아바타 fallback 통일 설계

## 목표

사용자가 프로필 사진을 설정하지 않았을 때 메인 피드, 스쿼드 피드, 애니 상세 감상평, 스쿼드 최근 감상 목록에서 닉네임 첫 글자 대신 `/default-avatar.png`를 표시한다.

## 범위

- 공용 `Timeline.Avatar`를 사용하는 모든 화면에 동일한 fallback을 적용한다.
- `avatarUrl`이 있는 사용자는 기존에 설정한 프로필 사진을 그대로 표시한다.
- NavBar는 이미 같은 fallback 규칙을 사용하므로 변경하지 않는다.
- 전역 Avatar 컴포넌트 통합이나 스타일 리팩터링은 하지 않는다.

## 동작

아바타 이미지 경로 선택 규칙은 다음과 같다.

1. `avatarUrl`이 문자열이면 해당 URL을 사용한다.
2. `avatarUrl`이 `null`이면 `/default-avatar.png`를 사용한다.

기존 크기별 클래스와 원형 `object-cover` 스타일은 유지한다.

## 검증

- 사용자 지정 URL이 그대로 선택되는 테스트
- URL이 없을 때 `/default-avatar.png`가 선택되는 테스트
- 기존 프론트 테스트, TypeScript 검사, 프로덕션 빌드
