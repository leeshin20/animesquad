# Chrome Extension — Netflix 감지 패키지 안전성 보강

## 문제

로컬 소스에는 Netflix DOM 메타데이터 파싱과 `/watch/` 제한이 적용되어 있지만,
`chrome-extension.zip`에는 이전의 10분 체류 감지 코드가 남아 있다. 이 패키지를
설치하면 Netflix 홈에서 읽은 `홈 - 넷플릭스`가 `pending` 기록으로 저장되고,
재생 종료 시 잘못된 팝업이 열릴 수 있다.

## 목표

- 배포 ZIP과 로컬 확장 프로그램 소스를 일치시킨다.
- Netflix 홈·탐색 화면에서 잘못된 기록 후보가 Service Worker까지 도달해도 거부한다.
- 과거 버전이 저장한 `홈 - 넷플릭스` pending을 팝업에서 제거한다.
- 엔딩 버튼 감지는 기존의 50ms DOM 변경 병합 시간을 유지한다.

## 설계

### 패키지

- 매니페스트 버전을 `1.0.1`로 올려 최신 설치 여부를 확인할 수 있게 한다.
- `manifest.json`이 ZIP 루트에 위치하는 깨끗한 Chrome 배포 ZIP을 생성한다.
- 테스트와 macOS 메타데이터 파일은 배포 ZIP에서 제외한다.

### Service Worker 방어

Netflix에서 온 `WATCHED` 메시지는 발신 탭 URL이 `/watch/` 경로일 때만 처리한다.
또한 작품명이 `Netflix`, `넷플릭스`, `홈 - 넷플릭스`처럼 서비스명뿐인 경우에는
pending 저장과 팝업 열기를 수행하지 않는다. Content Script의 1차 검사와 별개인
경계 검증으로 두어 오래된 탭이나 향후 파싱 오류도 차단한다.

### Popup의 기존 pending 정리

팝업 초기화 시 위의 잘못된 Netflix 서비스명 pending을 발견하면 저장소에서
제거하고 빈 화면을 표시한다. 정상 작품의 pending은 그대로 보존한다.

### 감지 시점

`MutationObserver`가 엔딩 또는 다음 화 UI 변화를 받으면 여러 연속 변경을 50ms로
합친 뒤 검사한다. 2초 유지 조건은 두지 않으며, 사용자가 체감하기에는 버튼 노출과
동시에 팝업 요청이 발생한다.

## 테스트

- Netflix 홈 URL에서 온 `WATCHED` 메시지를 Service Worker가 무시한다.
- Netflix 재생 URL이라도 작품명이 서비스명뿐이면 무시한다.
- 정상 `/watch/` URL과 DOM 작품명·회차 조합은 기존처럼 처리한다.
- 잘못된 기존 pending은 제거되고 빈 화면이 표시된다.
- 정상 pending은 제거되지 않는다.
- 전체 확장 프로그램 테스트를 실행하고 생성 ZIP 내부의 매니페스트 위치와 버전을 확인한다.

## 범위 제외

- 50ms DOM 변경 병합 시간 변경
- Netflix 버튼 선택자 변경
- 90% 이후 30초 재생 보조 기준 변경
