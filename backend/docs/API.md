# 아가아이 서버 구성

Java 21 / Spring Boot 3.5 / Spring Security JWT / JDBC / PostgreSQL / Flyway.
API 접두사는 `/api/v1`, 대화형 명세는 실행 중인 서버의 `/docs`입니다.

- `/auth/*`, `/me/workspaces`: 아이디 계정과 세션
- `/children/*`: 아이 정보와 접근 권한
- `/children/{id}/care-history`: `kind=routines|sleepRecords`, 수면 기록 저장/수정/삭제
- `/children/{id}/summary`: 수면 및 안전 기록 요약
- `/pairing/*`, `/device-pairings/*`, `/devices/*`: 기기 승인/해제
- `/device/sky-eye/status`: 카메라 관측만 허용 목록으로 저장 (audio/personalization 필드는 저장 안 함)
- `/device/sky-eye/events`: risk/status/posture 이벤트만 처리
- `/children/{id}/sky-eye`: 카메라 상태와 안전 관측
- 카메라 프레임 API, 안전 이벤트 확인/해결, 알림 outbox 및 SSE

울음 종류의 감지 이벤트와 울음 기록 조회는 422로 거절합니다.
울음 추천/피드백/모델 피드백 명령 API는 없습니다.
새 DB에는 울음 테이블/트리거/피드백 명령 테이블을 생성하지 않습니다.

이 마이그레이션은 새 아가아이 DB 전용입니다. 기존 아이쿠 DB에 적용하지 마세요.
기존 원본의 회원/기록/기기 키/비밀번호는 이 복사본에 포함되지 않습니다.
