# Tizen Native Probe

[English](README.md)

Web UI에서 C++ Native Service로 요청을 보내고, 현재 기기에서 API가 어디까지 동작하는지 확인하는 작은 개발용 샘플이다.

**제공하는 것은 소스와 빌드 도구다. 실제 TV 제품 SDK로 빌드하거나 서명한 WGT는 포함하지 않았다.** Web과 C++ 처리 코어는 분리돼 있어, TV SDK를 확보하기 전에도 화면 소스와 계산 로직을 먼저 확인할 수 있다.

## 이 샘플로 확인하는 것

| 단계 | 기능 | 무엇이 확인되는가 |
| --- | --- | --- |
| 1 | Web API 확인 | `tizen.*` 객체 존재, 현재 app/package ID, 플랫폼 버전과 web.service capability의 실제 조회 결과 |
| 2 | Native 연결 | 같은 패키지의 C++ 서비스를 실행하고 Message Port로 ping 응답 수신 |
| 3 | 연산 요청 | Web이 보낸 정수 두 개를 C++가 더하고 결과 반환 |
| 4 | Native API 확인 | 실행 파일의 아키텍처, 컴파일러와 제한된 System Information 호출 결과 |
| 5 | 진단 JSON | 실행 모드, 요청과 오류, 확인한 API 범위를 기록 |

브라우저 데모는 명시적으로 켜야 한다. Native 연결에 실패해도 데모로 자동 전환하지 않는다. 데모 응답에는 `browser-demo`와 `simulated` 표시가 있고, Native 성공 플래그는 켜지지 않는다.

KeyManager와 Filesystem은 Web 객체 존재만 확인한다. 보안 데이터 읽기, 파일 쓰기, KeyManager 저장 테스트는 구현하지 않았다. **API 객체가 보이는 것과 해당 기능을 사용할 수 있는 것은 다른 단계다.** 세부 범위는 [API_MATRIX.md](docs/API_MATRIX.md)에 있다.

vconf도 검증 대상에 포함한다. 다만 현재 버전에는 vconf 호출을 구현하지 않았고, 제품에서 사용할 key 목록과 값의 타입도 아직 정해지지 않았다. SDK 헤더와 라이브러리, key별 읽기와 쓰기 및 변경 알림, 실제 Native Service의 권한을 나눠 확인하는 절차를 [VCONF.md](docs/VCONF.md)에 정리했다. 임의의 시스템 key로 동작을 시험하지 않는다.

하이브리드 구조와 삼성 TV 적용 조건은 [ARCHITECTURE.md](docs/ARCHITECTURE.md), 전체 구현과 검증 상태는 [REQUIREMENTS.md](docs/REQUIREMENTS.md)를 참고한다.

## 가장 먼저 할 일

ZIP을 푼 폴더에서 다음을 실행한다. Python 3.9 이상이 필요하다. Windows에서는 `python3` 대신 `py -3`를 사용할 수 있다.

```sh
python3 scripts/sdk.py doctor --output sdk-report.json
```

이 명령은 설치된 SDK의 Web/Native 템플릿과 rootstrap을 조회한다. rootstrap은 해당 기기의 헤더, 라이브러리와 컴파일 대상을 연결하는 SDK 구성이다. SDK를 설치하거나 인증서를 생성하지 않으며, TV에 연결하지 않는다.

Tizen CLI가 PATH에 없다면 실행 파일을 직접 지정한다.

```sh
python3 scripts/sdk.py --tizen "/실제/SDK/tools/ide/bin/tizen" doctor --output sdk-report.json
```

**TV용 Native Service 템플릿이나 rootstrap이 없으면 제품 SDK 제공 여부부터 확인해야 한다.** C++ 소스를 더 작성하는 것으로 해결되는 단계가 아니다. 일반 Mobile/Wearable 타깃을 TV 타깃으로 자동 선택하지 않는다.

그다음은 [BUILD_GUIDE.md](docs/BUILD_GUIDE.md)의 **Web-only → Native → hybrid** 순서로 진행한다.

## SDK 없이 해 볼 수 있는 것

### 화면과 흐름

`web/index.html`을 PC 브라우저에서 열고 `브라우저 데모 시작 → 데모 연결 → 연산 요청` 순서로 누른다. 초기값 `12 + 30`의 모의 결과는 `42`다. 이것은 JavaScript 데모이며 C++ 실행 결과는 아니다.

### C++ 코어

PC에 GCC 또는 Clang이 있다면:

```sh
python3 scripts/host_test.py
```

이 명령은 C++ 요청 처리 코어를 임시 디렉터리에서 빌드하고 검사한 다음 PC 실행 파일을 제거한다. Native API와 TV 통신은 검사하지 않는다.

## 코드 위치

| 위치 | 역할 |
| --- | --- |
| `web/index.html`, `web/css/app.css` | 진단 화면. 리모컨 방향키와 Enter 지원 코드 포함 |
| `web/js/settings.js` | application ID, 포트와 timeout 설정 |
| `web/js/bridge.js` | 서비스 실행, Message Port 요청/응답, sender 확인, timeout |
| `web/js/app.js` | API 진단과 UI, JSON 기록 |
| `web/config.xml` | TV Web App 선언. JS Web Service를 선언하는 파일이 아님 |
| `native/src/service.cpp` | 실제 Tizen Service 생명주기와 Message Port, Native API 호출 |
| `native/src/probe_protocol.cpp` | `ping`, `add`, `probe` 처리 |
| `native/include/probe_config.h` | Native 설정과 선택적 SystemInfo 빌드 |
| `native/CMakeLists.txt` | PC 코어 테스트와 제품 SDK toolchain을 받는 선택적 ELF 빌드 |
| `scripts/sdk.py` | SDK 조회, SDK 템플릿으로 프로젝트 생성, 빌드 명령과 패키지 검사 |
| `docs/` | 빌드, API 범위, 검증 기록 |
| `tests/` | JS 브리지 로직과 선택적 Playwright UI 테스트 |

`.project`와 `.cproject`를 임의 SDK 버전에서 복사해 넣지 않았다. `create-web`/`create-hybrid`가 **사용자 SDK의 실제 템플릿으로 생성한 프로젝트에** 샘플 소스를 넣는다.

기본 ID는 package `CppProbe01`, Web `CppProbe01.WebUI`, Native `CppProbe01.NativeService`다. 실서비스에 붙일 때는 Web config와 JS 설정, Native manifest와 `probe_config.h`를 함께 바꾼다.

## 검증 상태

2026-11-12 기준 실제 수행 범위와 제한은 [VALIDATION.md](docs/VALIDATION.md)에 기록했다. PC C++ 테스트나 모의 MessagePort 테스트를 실제 TV IPC 성공으로 해석하지 않는다.

공식 근거와 적용 범위는 각 문서에 링크했다. Tizen 공통 hybrid 구조와 특정 삼성 TV 제품 SDK의 허용 여부는 구분한다.
