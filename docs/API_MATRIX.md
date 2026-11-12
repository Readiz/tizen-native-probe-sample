# API 지원 범위와 결과 해석

기준일: 2026-11-12. 이 문서는 `web/js/app.js`, `web/js/bridge.js`, `native/src/service.cpp`의 실제 검사 범위를 설명한다. **Tizen 제품 SDK로 빌드하거나 서명, TV 설치, 실기 IPC/API 실행을 검증한 상태는 아니다.** 브라우저 데모와 PC C++ 코어 테스트 결과는 해당 범위에서만 사용한다.

## 샘플이 확인하는 항목

표의 “검사”는 해당 버튼을 눌렀을 때 실행하도록 구현한 동작이다. 아직 얻지 않은 TV 성공 결과를 뜻하지 않는다.

| 대상 | 공식 문서의 범위 | 샘플의 검사 | 남는 확인 |
| --- | --- | --- | --- |
| `tizen.application.getCurrentApplication()` | [TV Application API][application] | Web 앱의 실제 application ID와 package ID를 읽는다. 연결할 때 설정과 비교한다. | 현재 TV 펌웨어에서 호출 성공 여부 |
| `tizen.application.launch()` | 일반 [Web privilege 목록][web-privileges]에 `application.launch`가 있다. 현재 TV 레퍼런스의 메서드 목록과 예제에는 차이가 있다. | 객체/메서드 존재를 기록한다. Native 포트가 없으면 설정된 Native application ID로 실행을 요청한다. | 제품 SDK의 실행 경로, 패키지 등록, 서명과 호출 권한. launch 성공 callback만으로 Native 연결 성공을 판정하지 않는다. |
| Web MessagePort | [TV API 목록][web-index]에서 Mandatory, [레퍼런스][messageport]는 Since 2.1 | reply 포트를 등록하고 `ping`, `add`, `probe`를 보낸다. 응답의 실제 sender app ID와 포트, 요청 ID와 op를 확인한다. | 해당 TV에서 Native 서비스와 실제 왕복 성공 여부 |
| Web SystemInfo | [SystemInfo][systeminfo]의 `getCapability()`는 Since 2.3 | `platform.version`, `web.service` 두 capability를 실제 호출하고 값 또는 오류를 기록한다. | 이 두 결과로 검사하지 않은 다른 API의 사용 가능 여부까지 알 수는 없다. `getPropertyValue()`는 호출하지 않는다. |
| `tizen.filesystem` | [TV Web API 목록][web-index] | **객체 존재만** 검사한다. | 파일 읽기, 쓰기, 경로 접근 권한은 모두 미검증 |
| `tizen.keymanager` | [API 레퍼런스][keymanager]와 [Seller Office 체크리스트][launch-checklist]의 안내가 다르다. 아래 절 참조. | **객체 존재만** 검사한다. | 저장, 읽기, 삭제, 앱 간 권한 부여는 실행하지 않는다. |
| Native Service / Message Port | 일반 Tizen의 [Service Applications][native-service], [Native Message Port][native-messageport] | `service_app_main()`과 lifecycle callback, 포트 등록/해제, bundle 요청 수신과 응답을 구현했다. | TV rootstrap 빌드, hybrid 패키지 설치와 실제 실행. 일반 Tizen 문서가 제품별 배포 허용까지 증명하지는 않는다. |
| Native System Information | [Native System Information][native-system] | 빌드 옵션이 켜져 있으면 모델명, 플랫폼 버전, Web Service와 Wi-Fi capability를 조회한다. 호출별 반환 코드와 값을 응답한다. | 해당 SDK의 헤더/라이브러리와 TV의 각 key 지원 및 호출 권한 |
| Native C++ 계산 | 샘플 자체 구현 | `add`가 두 정수를 더한다. Web 입력은 각각 ±1,000,000,000 범위로 제한한다. | PC 코어 테스트 성공과 TV C++ 실행 성공은 별개다. |
| vconf | 제품 SDK의 헤더, 라이브러리와 key별 접근 계약을 확인해야 한다. | **호출 검사 미구현**. 실제 key 이름과 자료형도 아직 지정하지 않았다. | key별 읽기와 쓰기, 변경 알림 및 실제 Native Service 권한. [검증 절차](VCONF.md) 참조. |

기본 Web `config.xml`에는 `application.launch`만 privilege로 선언했다. 이 선언 자체로 모든 TV에서 Native 서비스 실행이 허용되는 것은 아니다. Samsung은 [민감 API의 privilege 선언과 적절한 수준의 서명][privileges]을 함께 요구한다. API 그룹이 Mandatory라는 표기도 개별 메서드, hardware feature, 서비스 설치 정책을 모두 보장하지 않는다.

일반 Tizen [AppControl 문서][app-controls]는 Tizen 2.4부터 다른 package의 service 실행을 지원하지 않고 같은 package 안에서 명시적으로 실행하도록 설명한다. 따라서 이 샘플의 Web/Native 식별자를 함께 맞추고 제품 SDK의 hybrid 패키징을 사용한다. 별도 TPK를 설치해 둔 상태를 같은 패키지의 검증으로 대신하지 않는다.

## Native 응답 읽기

`probe` 응답의 `status: "ok"`는 요청을 처리했다는 뜻이다. 각각의 API 결과는 별도로 읽는다.

| 필드 | 해석 |
| --- | --- |
| `runtime: "tizen-native"` | Native 어댑터가 넣는 런타임 표기. Web은 응답 포트의 sender 정보도 함께 확인한다. |
| `service_app_status: "running"` | 요청을 처리한 시점에 서비스 callback이 동작 중이다. |
| `message_port_status: "request_received"` | 이번 요청이 Native에 도착했다. Web까지 응답을 받았으면 왕복 경로도 확인한 것이다. |
| `architecture`, `compiler`, `cpp_standard` | **컴파일할 때**의 아키텍처/컴파일러/언어 표준이다. 기기의 모든 ABI를 열거한 결과가 아니다. |
| `sdk_build_label` | 개발자가 빌드 설정으로 넣는 문자열이다. SDK 버전을 자동 검출하지 않는다. |
| `native_api`, `system_info_build_status: "linked"` | 이 실행 파일에 연결한 모듈 목록이다. 해당 모듈의 모든 API 사용을 검증한 것은 아니다. |
| `model_name_*`, `platform_version_*`, `web_service_*`, `wifi_*` | 각 항목의 `*_status`, 원본 `*_code`, `*_error`를 확인한다. 성공 시 `*_value`가 포함된다. |
| `disabled_at_build`, `not_built` | `PROBE_ENABLE_SYSTEM_INFO=0`으로 해당 기능을 빌드에서 제외했다. 기기 미지원 판정이 아니다. |
| `keymanager_status: "not_tested"` | KeyManager를 호출하지 않았다. 항상 이 값이다. |

capability 조회가 성공하며 `false`를 반환하면 “호출 실패”가 아니라 “해당 feature를 지원하지 않는다고 응답”한 것이다. `web.service=true`도 JavaScript Web Service에 관한 값이므로 C++ Native Service와 hybrid WGT 허용을 증명하지 않는다. Samsung의 [Smart Hub Preview FAQ][preview-faq]가 Web Service 확인에 이 key를 사용한다.

브라우저 `DEMO` 모드의 덧셈과 진단 응답은 JavaScript 모의 동작이다. 보고서의 `mode`, `transportConfirmed`, `apiProbeRun`과 함께 읽는다. 모의 응답은 Native 성공 결과로 옮겨 적지 않는다.

## KeyManager는 별도 확인 대상

Samsung의 [KeyManager API 레퍼런스][keymanager]에는 `saveData()`, `getData()`, `removeData()`, `setPermission()`이 남아 있다. 또한 Tizen 3.0부터 `http://tizen.org/privilege/keymanager`를 선언하지 말라는 경고가 있다. 반면 [Seller Office Launch Checklist][launch-checklist]는 `keymanager`, `systemmanager`, `websetting` API를 더 이상 사용할 수 없다고 안내한다.

이 차이를 공개 문서만으로 인하우스 펌웨어의 동작까지 확정할 수는 없다. **현재 샘플은 Web 객체의 존재만 기록하며 KeyManager 저장/읽기 테스트나 Native `ckmc_*` 호출을 하지 않는다.** 이후 인하우스 SDK의 제공 범위와 배포 정책을 확인한 다음 별도 검사로 추가해야 한다. KeyManager 객체가 보이거나 Native 라이브러리가 링크된다는 이유만으로 secure storage 연동 성공이라고 기록하지 않는다.

## Native API를 확인하는 네 단계

1. **SDK 헤더:** 대상 TV 연식/플랫폼과 맞는 rootstrap에서 `service_app.h`, `message_port.h`, `bundle.h`, 선택적으로 `system_info.h`를 찾는다. 일반 Mobile/Wearable rootstrap으로 자동 대체하지 않는다.
2. **타깃 라이브러리:** 해당 rootstrap의 `.pc`와 라이브러리를 사용해 실제 cross compile/link한다. 호스트의 헤더나 라이브러리를 잘못 참조하지 않았는지 확인한다. CMake의 `.pc` 이름은 탐색 후보이며 SDK마다 확정해야 한다.
3. **권한과 패키지 정책:** 생성된 manifest의 app ID/exec, Web package ID, hybrid 설치 지원, 필요한 privilege와 distributor certificate 수준을 확인한다. 빌드 성공으로 이 단계를 통과한 것으로 처리하지 않는다.
4. **실기 동작:** 서명한 패키지를 설치하고 서비스 연결, `ping`, `add`, `probe`를 차례로 실행한다. 호출별 원본 오류를 남기고 TV 모델, 펌웨어, SDK/rootstrap 라벨과 함께 기록한다.

[공식 CLI 문서][cli]의 `tizen list native-project`, `tizen list rootstrap`, `tizen list rootstrap <name>`으로 SDK가 제공하는 template과 framework부터 확인할 수 있다. 빌드 명령과 패키징 절차는 `BUILD_GUIDE.md`를 따른다. CMake가 만든 ELF만으로 설치 가능한 hybrid WGT가 완성되는 것은 아니다.

## 오류를 해석할 때

| 결과/오류 | 우선 확인할 내용 |
| --- | --- |
| `NO_TIZEN` | 현재 실행 환경에 MessagePort namespace가 없다. 일반 브라우저인지, TV의 설치된 Web 앱인지 확인한다. |
| `APP_ID_MISMATCH` | 실제 Web app/package ID가 `web/js/settings.js`와 다르다. Web config, Native manifest와 컴파일 설정을 함께 맞춘다. |
| `NO_LAUNCH_API` | Native 포트가 없고 `application.launch`도 없다. 해당 내부 SDK에서 허용하는 서비스 시작 경로를 확인한다. |
| launch의 `NotFoundError` | 지정한 Native app ID가 등록됐는지와 hybrid에 서비스가 실제 포함됐는지 확인한다. 포트 조회의 일시적 `NotFoundError`와 구분한다. |
| `SecurityError` / `SYSTEM_INFO_ERROR_PERMISSION_DENIED` | 호출 단계의 권한, manifest privilege, 서명 수준과 제품 정책을 확인한다. 객체 존재 여부와는 별개다. |
| `PORT_NOT_READY` | 기본 6초 동안 포트가 등록되지 않았다. 서비스 시작 실패, 종료, ID/포트 불일치, 패키지 구성을 확인한다. 이 오류 하나로 Native Service 미지원이라고 확정하지 않는다. |
| `TIMEOUT` | 기본 4초 안에 유효한 응답이 없었다. 서비스 상태, reply 포트, sender/프로토콜 검사로 응답이 무시된 로그를 확인한다. |
| `SYSTEM_INFO_ERROR_INVALID_PARAMETER` 등 key 조회 오류 | 요청한 key와 자료형, SDK/펌웨어의 해당 key 지원 여부를 확인한다. 오류를 무조건 권한 문제로 분류하지 않는다. |
| `not_built` / `disabled_at_build` | 빌드 옵션으로 제외된 항목이다. 권한 오류나 기기 미지원이 아니다. |
| `NOT_CONNECTED` / `CANCELLED` | 연결 전 요청 또는 연결 종료다. 먼저 연결 상태를 확인한다. |

timeout 값은 `web/js/settings.js`에서 변경할 수 있다. Native 응답의 `*_code` 원본과 Web 오류의 `name`/`message`를 보존하면 제품 담당자가 원인을 나누기 쉽다.

## 내부 SDK 담당자에게 확인할 최소 내용

> 2017년 이후 대상 TV에서 Web UI와 C++ Native Service를 하나의 hybrid WGT로 묶어 실행하려고 합니다. 샘플은 Service Application, Message Port/bundle, 읽기 전용 System Information만 사용합니다. 현재 프로젝트에서 사용할 **TV rootstrap의 정확한 이름과 버전**, Native Service와 hybrid WGT의 지원 여부 및 공식 생성/설치 예제를 알려주세요. 각 API에 제공되는 헤더, link library 또는 `.pc` 이름, 필요한 manifest/privilege와 서명 수준도 확인 부탁드립니다. KeyManager는 아직 호출하지 않았으며, 인하우스 앱에서 Web `tizen.keymanager`와 Native client API를 사용할 수 있는지도 별도로 확인하고 싶습니다.

[application]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html
[web-index]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references.html
[web-privileges]: https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/reference/security-privileges.md
[messageport]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/messageport-api.html
[systeminfo]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/systeminfo-api.html
[keymanager]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/keymanager-api.html
[launch-checklist]: https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html
[native-service]: https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/applications/service-app.md
[native-messageport]: https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/app-management/message-port.md
[native-system]: https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/device/system.md
[app-controls]: https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/app-management/app-controls.md
[privileges]: https://developer.samsung.com/smarttv/develop/faq/privileges.html
[preview-faq]: https://developer.samsung.com/smarttv/develop/faq/smart-hub-preview.html
[cli]: https://github.com/Samsung/tizen-docs/blob/master/docs/sdk-tools/baseline-sdk/common-tools/command-line-interface.md
