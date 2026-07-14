# Invite code signup final fixes

## 발견 1 — 익명 invite-code oracle

- `app.invite.code`의 blank/null 503 fail-closed 검사를 가장 먼저 유지했다.
- 그 다음 `invite_signup` 쿠키의 존재 및 `InviteSignupTokenService.parse`를 통한 서명/만료/purpose 검증을 수행하도록 순서를 변경했다.
- 유효한 invite token에만 IP limiter 조회 및 실패 기록과 코드 비교가 적용된다.
- no-cookie + wrong-code를 5회 호출해 모두 401인지, 이어 유효 token + wrong-code가 403인지 검증하여 invalid token이 limiter 실패를 소비하지 않음을 고정했다.

## 발견 2 — 기존 사용자 OAuth invite cookie 삭제

- 기존 사용자 성공 분기에서 정식 `ASQ_SESSION` 뒤 `clearInvite()` Set-Cookie를 추가했다.
- terms 완료/미완료 기존 사용자 테스트 모두 정확히 2개(session + invite deletion) 헤더를 검증한다.
- 신규 사용자 테스트의 정확히 1개 invite cookie 검증은 그대로 유지된다.

## 발견 3 — limiter 만료 entry 누적

- 외부 라이브러리/스케줄러 없이 실패 기록 64회마다 현재 map의 expired entry를 제거한다.
- `Clock` 기반 테스트에서 다른 IP의 entry를 만료시킨 뒤 후속 IP 활동 64회로 정리되는 것을 검증한다.

## TDD RED

명령:

```text
./gradlew test --tests '*InviteSignupControllerIT.returns401ForWrongCodeWithoutInviteCookieWithoutConsumingLimiterFailures' --tests '*InviteAttemptLimiterTest.laterFailureRemovesExpiredEntriesForOtherIps' --tests '*OAuth2LoginSuccessHandlerTest.existingUserGetsSessionAndNormalRedirect' --tests '*OAuth2LoginSuccessHandlerTest.existingUserWithoutTermsGetsOnboardingRedirect'
```

출력 요약: `4 tests completed, 4 failed`, `BUILD FAILED`. 각각 401 기대 대비 기존 403, expired entry 잔존, 두 기존 사용자 분기의 clear-invite 호출 누락으로 실패했다.

## GREEN 및 회귀

Focused GREEN:

```text
./gradlew test --tests '*InviteSignupControllerIT' --tests '*InviteAttemptLimiterTest' --tests '*OAuth2LoginSuccessHandlerTest'
```

출력 요약: `BUILD SUCCESSFUL in 11s`.

최종 auth 회귀:

```text
./gradlew test --rerun-tasks --tests '*InviteSignupControllerIT' --tests '*InviteAttemptLimiterTest' --tests '*AuthControllerIT' --tests '*OAuth2LoginSuccessHandlerTest' --tests '*JwtServiceTest'
```

출력 요약: `BUILD SUCCESSFUL in 14s`, `5 actionable tasks: 5 executed`; XML 합계 39 tests, failures 0, errors 0, skipped 0.

중간 회귀에서 기존 tampered JWT 테스트가 마지막 Base64URL 문자 변경 시 같은 바이트로 디코딩될 수 있어 1회 실패했다. signature 첫 문자를 변경하는 결정적 변조로 교정한 후 위 최종 회귀가 통과했다.

## 변경 파일

- `backend/src/main/java/com/animesquad/auth/InviteSignupController.java`
- `backend/src/main/java/com/animesquad/auth/InviteAttemptLimiter.java`
- `backend/src/main/java/com/animesquad/auth/OAuth2LoginSuccessHandler.java`
- `backend/src/test/java/com/animesquad/auth/InviteSignupControllerIT.java`
- `backend/src/test/java/com/animesquad/auth/InviteAttemptLimiterTest.java`
- `backend/src/test/java/com/animesquad/auth/OAuth2LoginSuccessHandlerTest.java`
- `.superpowers/sdd/final-fixes-report.md`

## 자체 리뷰 및 우려

- 변경은 세 발견과 관련 회귀 테스트에 한정했다.
- cleanup은 활동 기반이므로 실패 기록이 전혀 없는 동안 만료 entry는 메모리에 남지만, 새 실패 활동 64회 이내에 제거된다. 별도 스케줄러 없이 요청된 저비용/최소 구조의 의도적 절충이다.
- `git diff --check` 통과.
