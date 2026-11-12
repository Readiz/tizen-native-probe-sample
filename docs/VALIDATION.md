# 검증 기록

검증일: 2026-11-12. 공개 전 재검사는 macOS의 호스트 환경에서 실행했다. 실제 TV와 제품 SDK의 동작을 확인한 기록은 아니다.

## 실행한 검사

| 검사 | 결과 | 확인 범위 |
| --- | --- | --- |
| C++ 코어 | 32개 검사, 실패 0 | C++11, 경고를 오류로 처리한 호스트 빌드와 요청 처리 |
| JavaScript 브리지 | 11개 시나리오 통과 | Node VM의 가짜 MessagePort |
| 연결 재시도 경쟁 조건 | 통과 | 이전 launch 오류가 새 연결을 실패시키지 않음 |
| JavaScript 구문 | 6개 파일 통과 | Web JS 3개와 테스트 JS 3개 |
| Python 구문 | 2개 파일 통과 | SDK helper와 호스트 빌드 helper |
| 산출 폴더 없는 소스 복사본 | 브리지 검사 통과 | 테스트가 `artifacts/`를 직접 생성함 |

브리지 검사는 API 부재, app ID 불일치, 원본 SecurityError 보존, launch 후 포트 대기, 요청 ID 대응, Native 오류 코드 보존, 잘못된 응답의 timeout과 모의 동작 표기를 검사한다. 실제 Tizen API나 DOM 렌더링 검사가 아니다.

## 재현 명령

프로젝트 루트에서 실행한다. GCC 또는 Clang, Python 3.9 이상, Node.js가 필요하다.

```sh
python3 scripts/host_test.py
node tests/bridge.test.cjs
node tests/bridge-race.test.cjs
node --check web/js/bridge.js
node --check web/js/app.js
node --check web/js/settings.js
node --check tests/bridge.test.cjs
node --check tests/bridge-race.test.cjs
node --check tests/browser.test.cjs
python3 -m py_compile scripts/sdk.py scripts/host_test.py
```

Python 바이트코드 캐시 위치에 쓰기 권한이 없으면 `PYTHONPYCACHEPREFIX`를 쓰기 가능한 임시 디렉터리로 지정한다. 브리지 검사는 `artifacts/bridge-test-results.json`을 생성하며, 이 파일은 Git에서 제외한다. JSON의 `actualTizenSdkBuild=false`, `actualTvIpc=false`는 검증 범위를 나타낸다.

GitHub Actions에는 호스트 C++와 브리지 검사, 구문 검사를 구성했다. 각 원격 실행의 결과는 저장소의 Actions에서 확인한다.

## 아직 검증하지 않은 것

- CMake 구성과 빌드: 공개 준비 환경에 CMake가 없어 미실행.
- 브라우저 렌더링과 리모컨 UI: 이번 공개 준비에서는 실행하지 않았다. `tests/browser.test.cjs`는 Playwright와 Chromium이 있는 환경의 선택적 검사다.
- `service.cpp`의 제품 SDK 컴파일과 링크, TV용 ELF 생성.
- 실제 서명 프로필을 이용한 Web/hybrid WGT 패키징과 TV 설치.
- TV에서의 Web ↔ Native IPC와 System Information 호출.
- KeyManager 실제 호출과 권한, vconf의 읽기와 쓰기 및 변경 알림.
- 모델과 펌웨어별 호환성 및 2017년 이후 전체 제품군 지원.

vconf 호출은 아직 구현하지 않았으며 제품 key와 자료형도 미지정이다. [VCONF.md](VCONF.md)는 후속 검증 조건을 설명한다. SDK 명령 생성, PC 검사, 모의 브라우저 검사를 제품 SDK와 실물 TV 성공으로 표시하지 않는다.
