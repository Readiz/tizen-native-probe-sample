# Tizen Web UI와 C++ Native Service의 하이브리드 구조

[프로젝트 안내](../README.ko.md) | [vconf 검증 범위](VCONF.md)

Tizen 공통 문서에는 Web UI와 하나 이상의 C/C++ Native Service를 하나의 WGT로 묶는 하이브리드 패키징이 있다. Web 화면을 유지하면서 별도 Native 프로세스에서 C++ 코드를 실행하는 구조다. 다만 이 구조가 특정 삼성 TV의 제품 SDK와 서명, 설치 정책에서 허용되는지는 별도로 확인해야 한다. 이 저장소에는 그 확인에 사용할 소스와 절차가 있으며, 실제 TV 성공 결과는 없다. [Tizen 하이브리드 패키징](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/guides/development/index.md#packaging-hybrid-applications)

## Web Service와 Native Service

| 구분 | Web Service | Native Service |
| --- | --- | --- |
| 작성 언어 | JavaScript | C/C++ |
| 실행 | Web Service 런타임 | 별도 Native 실행 파일과 서비스 생명주기 |
| 선언 | `config.xml`의 `tizen:service`와 JavaScript 진입 파일 | Native manifest의 `service-application`과 실행 파일 |
| 이 샘플에서의 역할 | 구현 대상 아님 | Web의 요청을 받아 C++ 처리와 플랫폼 API 조회 |

삼성 TV의 Web Service 설명에 Node 모듈이 등장해도 일반 Node.js의 `.node` 애드온을 임의로 로드할 수 있다는 뜻은 아니다. `web.service=true` 또한 C++ Native Service의 패키징 지원을 입증하지 않는다. JavaScript 서비스의 진입 파일을 `.cpp`나 `.so`로 바꾸는 것으로 Native 서비스가 만들어지지도 않는다. [Samsung Smart Hub Preview FAQ](https://developer.samsung.com/smarttv/develop/faq/smart-hub-preview.html), [Tizen Native Service](https://github.com/Samsung/tizen-docs/blob/master/docs/application/native/guides/applications/service-app.md)

## 패키지와 요청 흐름

지원되는 SDK에서는 Web과 Native 프로젝트를 각각 만들고 Web 프로젝트에 Native 프로젝트 참조를 추가한다. SDK가 둘을 빌드해 하이브리드 WGT를 만든다. 공통 문서의 패키지 구조는 Native 실행 파일을 `bin/`, 라이브러리를 `lib/`, 메타데이터를 `info/`, Web 루트를 `res/wgt/`에 둔다. 직접 ZIP의 모양만 맞추는 것으로 유효한 설치 패키지가 만들어지는 것은 아니다. [Tizen Hybrid Application Package](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/index.md#hybrid-application-package)

이 샘플의 Web ID는 `CppProbe01.WebUI`, Native ID는 `CppProbe01.NativeService`, 공통 package ID는 `CppProbe01`이다. Web은 Message Port로 `ping`, `add`, `probe`를 보내고 Native는 요청 ID와 송신자를 검사한 뒤 응답한다. Web도 응답자의 앱 ID와 포트, 요청 ID를 확인한다. 실제 어댑터의 System Information 조회 결과는 항목별 반환 코드로 구분한다. [Message Port 구현](../native/README.md)

같은 패키지로 설치되는 것과 특정 플랫폼 API의 권한은 별개다. 패키지 데이터 공유만으로 KeyManager 보안 항목이나 vconf key 접근이 자동 허용된다고 판단하지 않는다.

## 삼성 TV에서 확인할 경계

Samsung의 공개 테스트 FAQ는 Native `.tpk` 설치를 지원하지 않고 Web `.wgt`를 지원한다고 안내한다. 이 문구만으로 hybrid WGT 안의 Native Service와 모든 제품 배포 경로의 가능 여부를 확정할 수는 없다. 사용하는 TV SDK의 템플릿과 rootstrap, hybrid 패키지 허용, API와 서명 정책을 함께 확인해야 한다. [Samsung Application Testing FAQ, Q25](https://developer.samsung.com/smarttv/develop/faq/application-testing.html)

확인은 Web 앱 설치, TV 대상 C++ 컴파일과 링크, hybrid 설치와 Native 실행, 실제 IPC, 개별 API 호출 순서로 진행한다. PC에서 C++ 계산이 성공하거나 개발용 셸에서 플랫폼 API를 호출한 결과를 앱의 권한 검증으로 대신하지 않는다. `required_version=3.0` 선언도 2017년 이후 모든 모델과 펌웨어에서의 호환성을 보장하지 않는다.

KeyManager는 Web 객체 존재만 확인한다. vconf는 아직 호출하지 않는다. 두 기능을 포함한 후속 검증 범위와 필요한 입력은 [API 범위](API_MATRIX.md)와 [vconf 안내](VCONF.md)에 구분했다.
