# C++ Native Service

이 폴더는 **실제 Tizen Native Service 소스**와 **PC에서 검증할 수 있는 순수 C++ 코어**를 함께 담고 있다. PC 테스트가 성공해도 TV 패키지 설치, Message Port 동작, Native API 사용 권한까지 확인된 것은 아니다.

## 파일

| 파일 | 역할 |
| --- | --- |
| `src/service.cpp` | `service_app_main()` 진입점, Message Port 수신과 응답, System Information 호출 |
| `src/probe_protocol.cpp` | `ping`, `add`, `probe` 요청 검증과 순수 C++ 처리 |
| `include/probe_config.h` | Application ID와 포트 이름, API 빌드 옵션 |
| `include/probe_protocol.h` | 플랫폼과 분리된 요청 처리 인터페이스 |
| `tests/protocol_test.cpp` | 정수 경계, 잘못된 요청, 요청자 ID 검증 테스트 |
| `CMakeLists.txt` | 기본 PC 테스트 빌드와 선택적인 제품 SDK 빌드 |

## 먼저 PC에서 확인

프로젝트의 `native` 디렉터리에서 실행한다. GCC 또는 Clang의 C++11 컴파일러가 필요하다.

```sh
mkdir -p build-host
g++ -std=c++11 -O2 -Wall -Wextra -Wpedantic -Werror \
  -Iinclude src/probe_protocol.cpp tests/protocol_test.cpp \
  -o build-host/protocol_test
./build-host/protocol_test
```

성공 출력:

```text
Host C++ core: 32 checks, 0 failures. Tizen IPC/API/device behavior was not tested.
```

이 테스트 실행 파일은 PC용이다. WGT에 넣거나 TV에서 실행할 파일이 아니다.

CMake가 설치돼 있다면 같은 코어 테스트를 다음처럼 실행할 수도 있다. 기본값은 PC 테스트만 생성한다.

```sh
cmake -S . -B build-host-cmake
cmake --build build-host-cmake
ctest --test-dir build-host-cmake --output-on-failure
```

## 제품 SDK 프로젝트로 옮길 때

가장 먼저 **현재 제품 SDK에서 TV Native Service 프로젝트를 만들고 설치할 수 있는지** 확인한다. 일반 Mobile 또는 Wearable 프로필로 컴파일한 결과를 TV 호환 바이너리로 취급하지 않는다.

SDK가 Native Service 프로젝트를 생성할 수 있다면 다음 파일을 추가한다.

1. `src/service.cpp`, `src/probe_protocol.cpp`를 프로젝트 소스에 추가한다. 기존 템플릿의 `main()`은 하나만 남도록 제거하거나 교체한다.
2. `include/`를 헤더 검색 경로에 추가한다.
3. C++11 이상과 아래 API 헤더 및 라이브러리를 설정한다.
4. 생성된 Native manifest에서 application ID와 실행 파일 이름을 웹앱 설정과 일치시킨다.
5. 해당 SDK의 하이브리드 패키징 절차로 Web UI 프로젝트와 연결한다. C++ ELF 실행 파일을 만든 것만으로 설치 가능한 WGT가 만들어지는 것은 아니다.

기본 식별자는 다음과 같다.

| 항목 | 값 |
| --- | --- |
| Native application ID | `CppProbe01.NativeService` |
| 허용 Web application ID | `CppProbe01.WebUI` |
| Native 수신 포트 | `CPP_PROBE_SERVICE` |
| CMake 실행 파일 이름 | `NativeService` |

Application ID를 바꿀 때는 Web `config.xml`, Native manifest, `probe_config.h` 또는 컴파일 정의를 함께 바꾼다. 실행 파일 이름은 Native manifest의 `exec`와 맞춘다.

### 필요한 헤더와 pkg-config 후보

| 목적 | 헤더 | `.pc` 후보 |
| --- | --- | --- |
| Native Service 생명주기 | `service_app.h` | `capi-appfw-service-application`, `service-app` |
| Web과 IPC | `message_port.h` | `capi-message-port`, `message-port` |
| key/value 메시지 | `bundle.h` | `bundle` |
| 읽기 전용 플랫폼 정보 | `system_info.h` | `capi-system-info`, `system-info` |

여기서 `.pc` 이름은 **탐색 후보**다. 현재 제품 SDK의 rootstrap에서 실제 파일과 링크 결과로 확정해야 한다. CMake는 후보 중 실제 존재하는 모듈을 고르고, 헤더와 호출 심볼은 실행 파일 빌드 시 컴파일러와 링커가 검증한다. 후보 이름이 다르면 `PROBE_SERVICE_PC`, `PROBE_MESSAGE_PC`, `PROBE_BUNDLE_PC`, `PROBE_SYSTEM_PC`를 SDK의 정확한 이름으로 설정한다.

System Information 연결이 아직 준비되지 않았다면 `PROBE_ENABLE_SYSTEM_INFO=0` 컴파일 정의로 IPC만 먼저 검증할 수 있다. 이 경우 `probe`는 해당 항목들을 `not_built`로 보고하며 지원 성공으로 표시하지 않는다.

### 제품 SDK용 CMake 경로

제품 SDK가 CMake toolchain과 rootstrap용 pkg-config 설정을 제공할 때 사용하는 경로다. 아래 toolchain 경로와 SDK 라벨은 사용 중인 제품 SDK 값으로 바꾼다.

```sh
cmake -S . -B build-tizen \
  -DPROBE_BUILD_TIZEN=ON \
  -DCMAKE_TOOLCHAIN_FILE=/absolute/path/from_product_sdk/toolchain.cmake \
  -DPROBE_SDK_BUILD_LABEL="your-TV-SDK-and-rootstrap-version"
cmake --build build-tizen
```

PC의 pkg-config가 아닌 **제품 rootstrap의 헤더와 라이브러리**를 조회하도록 SDK 환경을 먼저 적용해야 한다. 일반적으로 SDK의 환경 스크립트 또는 `PKG_CONFIG_SYSROOT_DIR`와 `PKG_CONFIG_LIBDIR` 설정을 사용하지만, 경로는 제품 SDK마다 다르므로 여기서 특정 경로를 가정하지 않는다.

CMake는 `PROBE_BUILD_TIZEN=ON`일 때 toolchain을 지정하지 않거나 cross-compiling 설정이 아니면 중단한다. 이 보호장치는 PC 실행 파일을 TV 바이너리로 오인하는 것을 줄인다. 올바른 제품 SDK와 ABI를 선택했다는 검증을 대신하지는 않는다.

이 CMake 경로의 출력은 `NativeService` ELF 실행 파일이다. **manifest 구성, 서명, hybrid WGT 생성과 TV 설치는 제품 SDK 단계가 남는다.**

## 메시지 규약

모든 요청과 응답은 Message Port의 문자열 key/value 항목으로 전달한다.

요청 공통 필드:

```json
{"protocol":"1", "id":"request-1", "op":"ping"}
```

| 요청 | 추가 입력 | 성공 응답 핵심 |
| --- | --- | --- |
| `ping` | 없음 | `message: "pong"`, `runtime: "tizen-native"` |
| `add` | `a`, `b`: 문자열 정수 | `result`: 덧셈 결과 문자열 |
| `probe` | 없음 | 실행 중인 서비스와 API별 호출 결과 |

`a`와 `b`는 각각 -1,000,000,000부터 1,000,000,000까지 받는다. 소수, 공백, 지수 표기, `+` 부호와 범위 초과를 거절한다. `id`는 1~80바이트이며 응답에 그대로 돌려준다. 모든 정상 요청의 응답에는 `protocol`, `id`, `op`, `status`가 들어간다. 실패 시 `status: "error"`, `error`, `message`를 돌려준다.

Web은 자신의 reply LocalMessagePort를 `sendMessage(items, replyPort)`의 두 번째 인수로 전달해야 한다. Native는 콜백의 `remote_app_id`가 설정된 Web ID와 같은지 검사하고, 콜백이 전달한 실제 reply 포트로 응답한다. 응답에도 `message_port_send_message_with_local_port()`로 Native 수신 포트의 정보를 포함하므로 Web이 응답자의 app ID와 포트 이름을 검증할 수 있다.

## probe가 보여 주는 범위

`probe`의 `status: "ok"`는 요청이 정상 처리됐다는 뜻이다. **나열된 모든 Native API가 허용됐다는 뜻은 아니다.** 각 호출의 상태와 반환 코드를 따로 확인한다.

| 필드 | 의미 |
| --- | --- |
| `runtime` | 실제 adapter가 실행됐으면 `tizen-native` |
| `native_app_id` | 빌드에 설정된 Native application ID |
| `native_api` | 이 빌드에서 연결한 API 모듈 목록 |
| `architecture` | 실행 파일 컴파일 타깃의 아키텍처 매크로 |
| `compiler`, `cpp_standard` | 컴파일러 버전과 C++ 표준 매크로 |
| `sdk_build_label` | 개발자가 빌드할 때 입력한 SDK 라벨. 자동 검출 값이 아님 |
| `service_app_status` | 해당 callback이 동작 중임을 뜻하는 `running` |
| `message_port_status` | 현재 요청을 받았다는 뜻의 `request_received` |
| `system_info_build_status` | `linked` 또는 `disabled_at_build` |
| `model_name_*` | `http://tizen.org/system/model_name` 문자열 조회 |
| `platform_version_*` | `http://tizen.org/feature/platform.version` 문자열 조회 |
| `web_service_*` | `http://tizen.org/feature/web.service` capability 조회 |
| `wifi_*` | `http://tizen.org/feature/network.wifi` capability 조회 |
| `keymanager_status` | 항상 `not_tested`: KeyManager API를 호출하지 않음 |

각 `*_status`는 `ok`, `error`, `not_built` 중 하나다. 호출한 항목에는 `*_code` 원본 반환 코드와 `*_error` 오류 이름을 넣는다. 성공하면 `*_value`도 포함한다. capability의 `false`는 호출 실패가 아니라 해당 feature가 없다고 반환된 결과다. `web.service=true`만으로 C++ Native Service 패키징 지원까지 알 수는 없다.

이 샘플은 모델명과 플랫폼 버전처럼 제한된 읽기 전용 정보만 조회한다. KeyManager나 사내 API의 지원 여부는 해당 API를 추가로 빌드하고 실제 호출해야 확인할 수 있다. 서비스는 기본 OS 수명주기를 따르며 부팅 시 자동 실행이나 무제한 백그라운드 유지를 설정하지 않는다.

## 공식 근거

- [Tizen Native Service Applications](https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/applications/service-app.md): 생명주기와 `service_app_main()`.
- [Tizen Native Message Port](https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/app-management/message-port.md): bundle 형식, 수신 callback, 양방향 응답.
- [Tizen Message Port API reference](https://docs.stg.tizen.org/application/native/api/iot-headed/5.5/group__CAPI__MESSAGE__PORT__MODULE.html): `message_port_send_message_with_local_port()`와 trusted 함수의 서명. API 서명 확인용이며 TV 제품 지원 증거로 사용하지 않았다.
- [Tizen Native System Information](https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/device/system.md): `system_info_get_platform_string()`, `system_info_get_platform_bool()`, feature와 system key.

검증 상태: 2026-11-12, host core 32개 검사 통과. 실제 Tizen 제품 SDK 빌드, 서명, 설치와 실기 IPC/API 실행은 수행하지 않았다.
