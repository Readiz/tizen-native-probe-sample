# 빌드와 실기 확인

목표는 한 번에 모든 API를 붙이는 것이 아니라 **Web 앱 설치, Native 빌드, 같은 패키지의 IPC, 필요한 API**를 차례로 확인하는 것이다. 이 문서의 TV 명령은 사용자의 실제 SDK에서 실행할 절차이며, 샘플 제작 환경에서는 Tizen CLI와 제품 SDK가 없어 실행하지 않았다.

## 0. 설치된 SDK부터 확인

샘플 루트에서:

```sh
python3 scripts/sdk.py doctor --output sdk-report.json
```

또는 직접:

```sh
tizen list web-project
tizen list native-project
tizen list rootstrap
tizen list rootstrap "실제_TV_rootstrap_이름"
```

앞의 세 목록에서 **실제 설치된 이름**을 사용한다. 아래 명령의 `실제_...`는 그 이름으로 바꿀 자리다. 버전 번호를 추측해 넣지 않는다. 내부 SDK가 Tizen Studio CLI 대신 자체 빌드 시스템을 쓰면, `native/src`와 `native/include`를 그 빌드 시스템에 연결하고 같은 검증 순서를 따른다.

공식 CLI 문서: [Command Line Interface](https://github.com/Samsung/tizen-docs/blob/master/docs/sdk-tools/baseline-sdk/common-tools/command-line-interface.md).

## 1. Web-only 앱부터 TV에서 실행

이 단계는 C++를 포함하지 않는다. 먼저 현재 TV에서 Web API와 capability 조회를 확인한다.

### SDK 프로젝트 생성

```sh
python3 scripts/sdk.py create-web \
  --dest build/web-only \
  --web-profile "실제_TV_Web_Profile" \
  --web-template "실제_Basic_Template"
```

helper는 SDK의 `tizen create web-project`로 `WebUI`를 생성한 다음 `web/` 내용을 복사한다. 출력 폴더가 이미 있으면 기존 작업을 보존하고 중단한다. GUI를 쓴다면 실제 TV용 Basic Web 프로젝트를 만든 뒤 `web/` 파일을 복사해도 된다.

`config.xml`의 기본 `required_version`은 `3.0`이다. 이는 2017년 이후 조건을 위한 최소 선언이며, 그 선언 자체가 모든 API와 모든 연도의 동작을 검증하지는 않는다. Web 프로필은 `tv-samsung`으로 설정했다. 내부 제품 프로필이 다르면 해당 SDK의 유효한 값에 맞춘다.

### 빌드와 서명

```sh
python3 scripts/sdk.py build-web \
  --workspace build/web-only \
  --sign-profile "기존_TV_인증서프로필"
```

실행하는 공식 명령은 다음과 같다.

```sh
tizen build-web -- build/web-only/WebUI
tizen package -t wgt -s "기존_TV_인증서프로필" -- build/web-only/WebUI/.buildResult
```

자신의 TV/인하우스 배포에 쓰는 인증서 프로필을 사용한다. helper가 인증서나 비밀키를 생성하거나 변경하지 않는다. 서명 성공은 해당 TV의 설치 허용을 보증하지 않는다.

### 설치와 실행

기존 조직의 설치 절차나 Tizen Studio의 `Run As > Tizen Web Application`을 사용한다. CLI를 사용할 때는 빌드 출력에 실제로 생긴 파일명과 기기 serial을 확인해서 넣는다.

```sh
tizen install -n "실제_산출물.wgt" -s "실제_TV_serial" -- "실제_WGT_디렉터리"
```

Web-only 상태에서는 `Web API 확인` 결과를 먼저 본다. Native가 포함되지 않았으므로 `Native 연결` 실패는 예상된 결과다. 데모가 자동으로 성공 표시를 대신하지 않는다.

## 2. Native Service 프로젝트 구성

제품 SDK가 **TV Native Service와 hybrid WGT를 지원하는 경우**에 진행한다. Mobile/Wearable 템플릿이 보이는 것만으로 TV 타깃이 준비된 것은 아니다.

```sh
python3 scripts/sdk.py create-hybrid \
  --dest build/hybrid \
  --web-profile "실제_TV_Web_Profile" \
  --web-template "실제_Basic_Template" \
  --native-profile "실제_TV_Native_Profile" \
  --native-template "실제_Cpp_Service_Template"
```

helper는 다음을 수행한다.

1. 실제 SDK로 `WebUI`와 `NativeService` 프로젝트를 생성한다.
2. 새 Native 프로젝트의 예제 `src/`, `inc/`를 샘플 코드로 교체한다. 기존 사용자 프로젝트를 수정하는 도구가 아니다.
3. SDK가 생성한 Native manifest에서 package ID, service app ID, 실행 파일 이름을 맞춘다. SDK의 profile과 API 버전은 보존한다.
4. Web 프로젝트의 참조에 `NativeService`를 추가한다.

**SDK별 C++ compiler/linker와 라이브러리 설정까지 추측해 수정하지는 않는다.** 다음 설정은 실제 SDK에서 맞춰야 한다.

### C++ 설정

- `native/src/service.cpp`와 `probe_protocol.cpp`가 빌드 소스에 들어가야 한다. 생성 예제의 다른 `main()`은 함께 빌드하지 않는다.
- 헤더 검색 경로에 Native 프로젝트의 `inc/`를 넣는다.
- C++11 이상을 사용한다. 이 샘플은 STL과 예외 처리를 사용하므로 해당 타깃의 C++ 표준 라이브러리와 예외 처리가 켜져 있어야 한다.
- 최종 링크가 해당 TV 타깃용 `g++`/`clang++` 또는 동등한 C++ 링크 설정을 사용하는지 빌드 로그를 본다. CLI의 `-c gcc`만으로 C++ linker 설정까지 확정되는 것은 아니다.
- Native 실행 파일 이름은 `NativeService`이며 manifest의 `exec`와 일치해야 한다.

Tizen Studio에서는 일반적으로 `Properties > C/C++ Build > Settings > Tool Settings`의 C++ Compiler와 C++ Linker 설정을 사용한다. SDK 버전에 따라 메뉴가 다를 수 있다. [Samsung C++ 프로젝트 설정 예제](https://github.com/Samsung/tizen-app-assist/blob/master/docs/how-to-build-and-import-tizen-app-assist.md)는 설정 위치의 근거이며, 이 예제 자체가 TV 지원을 증명하지는 않는다.

### API 연결

| 헤더 | 필요한 기능 | pkg-config 탐색 후보 |
| --- | --- | --- |
| `service_app.h` | Native Service 생명주기 | `capi-appfw-service-application`, `service-app` |
| `message_port.h` | Web과 메시지 통신 | `capi-message-port`, `message-port` |
| `bundle.h` | 문자열 key/value 메시지 | `bundle` |
| `system_info.h` | 모델, 버전과 capability 조회 | `capi-system-info`, `system-info` |

`.pc` 이름은 탐색 후보이며 제품 SDK에서 확정한 이름이 아니다. **제품 rootstrap용 환경을 설정한 뒤** 실제 `.pc`의 `--cflags`와 `--libs`, SDK의 API framework 설정을 사용한다. PC `/usr/include`나 호스트 `.pc`를 대신 사용하지 않는다.

SystemInfo 연결에서 막히면 `PROBE_ENABLE_SYSTEM_INFO=0`을 C++ preprocessor 설정에 넣어 IPC부터 확인할 수 있다. 이 빌드는 SystemInfo 항목에 `not_built`를 반환한다. SDK 라벨을 출력하려면 `PROBE_SDK_BUILD_LABEL`에 실제 SDK 버전을 문자열로 설정한다. 자동 버전 감지 값은 아니다.

제품 SDK가 CMake toolchain을 제공한다면 [native/README.md](../native/README.md)의 CMake 경로도 있다. 이 출력은 ELF 실행 파일이며, hybrid 패키징 단계는 별도로 남는다.

## 3. Native 단독 빌드와 hybrid 패키징

### Native 컴파일 오류부터 확인

```sh
tizen build-native -r "실제_TV_rootstrap" -c gcc -C Debug -- build/hybrid/NativeService
```

해당 SDK가 LLVM을 사용하면 compiler를 `llvm`으로 바꾼다. 제품용 rootstrap을 선택한다. CPU가 64비트를 지원해도 TV 사용자 공간이 64비트라는 뜻은 아니므로 아키텍처는 SDK 설정과 산출물로 판단한다.

### hybrid 빌드 명령 생성

```sh
python3 scripts/sdk.py hybrid-command \
  --workspace build/hybrid \
  --rootstrap "실제_TV_rootstrap" \
  --platform "rootstrap에_표시된_platform" \
  --arch "rootstrap에_표시된_arch" \
  --compiler gcc \
  --sign-profile "기존_TV_인증서프로필"
```

이 명령은 공식 `tizen build-app` 형식으로 명령을 출력한다. 실제 빌드는 같은 인자의 `hybrid-command`를 `build-hybrid`로 바꿔 실행한다. 서명 프로필은 필요하지만 키나 암호를 명령 인자로 전달하지 않는다.

공식 구조는 `Web UI + Native Service`를 함께 빌드하고 WGT로 패키징하는 것이다. 각 프로젝트를 따로 설치한 것은 동일한 hybrid 설치 검증이 아니다. [Tizen Hybrid Packaging](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/guides/development/index.md).

### 산출물 확인

```sh
python3 scripts/sdk.py inspect-package "실제_hybrid_산출물.wgt"
```

WGT 안의 app/package ID, Native ELF 파일의 아키텍처, 서명 파일 존재를 확인한다. 이 도구는 서명을 암호학적으로 검증하거나 중첩 패키지까지 검사하지 않는다. 실제 서명과 설치 허용 여부는 SDK와 대상 TV에서 확인한다.

## 4. TV에서 성공으로 판단하는 순서

1. Web UI가 실행되고 현재 app ID와 package ID가 샘플 설정과 맞는다.
2. `Native 연결`이 `runtime=tizen-native`의 ping 응답을 받는다.
3. `12 + 30`의 C++ 처리 결과로 `42`를 받는다.
4. `Native API 확인`의 항목별 `*_status`, `*_code`, `*_value`를 확인한다.
5. 필요한 실제 기능을 하나씩 추가하고 같은 방식으로 기록한다.

`probe` 요청의 전체 `status=ok`는 요청 처리 성공이다. 개별 API 성공 여부는 해당 API의 상태를 따로 본다. `web.service=true`는 JavaScript Web Service capability이며, Native Service 설치 권한이나 KeyManager 지원을 대신 입증하지 않는다.

## 막힌 위치별 해석

| 관측 | 먼저 확인할 것 |
| --- | --- |
| Native Service 템플릿/rootstrap 없음 | 내부 TV Native SDK 또는 빌드 시스템 제공 여부 |
| 헤더를 찾지 못함 | 제품 rootstrap, include/framework 설정 |
| `undefined reference` | 해당 SDK의 링크 라이브러리, C++ linker와 ABI |
| 설치 거절 | hybrid 패키지 허용, 서명 프로필, 모델과 펌웨어 |
| `APP_ID_MISMATCH` | Web config, JS 설정, Native manifest와 config header의 ID |
| launch `NotFoundError` | 같은 패키지 안의 Native 앱 등록 여부와 app ID |
| `SecurityError` | 실제 API와 서비스 실행 권한. 원본 오류 이름을 보존한다 |
| `PORT_NOT_READY` | 서비스 crash, `service_app_main`, 포트 등록과 이름 |
| `TIMEOUT` | Native 요청 수신/응답, 양쪽 sender ID와 reply 포트 |
| `system_info_*` 오류 | 해당 key/API의 제품 지원과 권한. IPC 성공과 구분 |

이 단계에서 필요한 것은 거대한 API 목록보다 **해당 제품 SDK의 작은 성공 예제 하나**다. 같은 서명과 타깃으로 Native Service를 설치하고 Web과 ping을 주고받는 데 성공하면, 이후 API 문제를 패키징 문제와 분리할 수 있다.
