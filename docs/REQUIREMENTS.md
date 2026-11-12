# 요구사항과 수용 조건

이 저장소는 Tizen Web UI와 C++ Native Service의 하이브리드 구조를 검토하는 공개 소스 샘플이다. 구현과 PC 검사, 제품 SDK 빌드, 실물 TV 검증을 별도 상태로 관리한다.

| 요구사항 | 수용 조건 | 현재 상태 |
| --- | --- | --- |
| 공개 소스 | 샘플 코드, SDK helper, 재현 가능한 검사와 안내 제공. 인증서와 기기 진단은 제외 | 제공 |
| 하이브리드 구조 | Web Service와 Native Service, package/app ID, IPC와 제품 지원 조건 구분 | [문서 제공](ARCHITECTURE.md) |
| C++ 코어 | 요청과 송신자 검증, 정수 덧셈, 오류 처리 | 구현, PC 검사 범위는 [VALIDATION.md](VALIDATION.md) |
| Web ↔ Native IPC | 앱과 포트, 요청 ID 확인. 실패 시 모의 성공으로 전환하지 않음 | 구현, 모의 검사. TV 미검증 |
| System Information | 항목별 결과와 반환 코드 기록 | 어댑터 구현. 제품 SDK와 TV 미검증 |
| KeyManager | 실제 앱의 지원과 보안 항목 접근을 별도 검사 | Web 객체 존재 확인만 구현. 호출 검사 미구현 |
| vconf | 실제 key와 타입, 읽기/쓰기/변경 알림, Native Service 권한, 제품별 결과 | [검증 조건 제공](VCONF.md). key 미지정, 호출 검사 미구현 |
| 다른 플랫폼 API | 필요한 API 목록을 정하고 SDK/링크/권한/실기 결과 구분 | 구체적인 목록 미지정 |
| TV 빌드와 설치 | 올바른 제품 rootstrap과 서명으로 hybrid를 빌드, 설치하고 실제 IPC 확인 | 미검증 |
| 연도별 호환성 | 모델과 펌웨어별 동일 절차의 결과 확보 | 미검증. 2017년 이후 일괄 지원 주장 없음 |

실기 호출 결과가 없으면 지원 성공으로 기록하지 않는다. SDK 명령 생성이나 PC 테스트 통과도 실제 Native Service 컴파일 및 TV 설치의 증거로 사용하지 않는다.
