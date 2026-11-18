# 아가아이

아이의 수면 환경을 모니터링하고 수면 기록을 관리하는 웹 앱입니다.

- 아이디 회원가입·로그인과 아이 프로필
- 기기 연결 코드 승인과 연결 해제
- 카메라 미리보기와 자세·얼굴·주변 물체·가장자리 상태
- 안전 알림과 보호자 확인
- 수면 시간 추가·수정·삭제, 날짜별 히스토리와 수면 타임라인

울음 감지·알림·분석·대응 기록과 울음 데이터 기반 하루 흐름 기능은 제거했습니다.

## 프로젝트 구성

| 경로 | 구성 |
| --- | --- |
| frontend | React 19, TypeScript, Vite, Pretendard |
| backend | Java 21, Spring Boot, Spring Security JWT, JDBC, PostgreSQL, Flyway |
| backend/raspberry-pi | 기기 인증·카메라 및 안전 관측 전송용 Python 클라이언트 |

## 실행

Node.js 22 이상과 Java 21이 필요합니다. 이 PC에 준비된 Java/Maven 도구와 의존성 캐시는 Git 업로드에서 제외됩니다.
새로 내려받은 PC에서는 Java 21을 설치하고 JAVA_HOME을 설정합니다. Maven Wrapper는 필요한 Maven을 내려받습니다.

프론트엔드를 실행할 터미널에서 다음 명령을 입력합니다.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

다른 터미널에서 백엔드를 실행합니다.

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local.ps1
```

앱은 http://localhost:5177, API는 http://127.0.0.1:8081에서 실행됩니다.
API 명세는 http://127.0.0.1:8081/docs 에서 확인합니다.
개발용 PostgreSQL과 비밀키는 첫 실행 때 backend/data에 생성됩니다. 기록은 다음 실행에도 유지됩니다.
이 버전의 DB 마이그레이션은 새 아가아이 데이터베이스 전용입니다.

## 파이 연결

백엔드를 scripts/start-local.ps1 -Lan으로 실행한 뒤 backend/raspberry-pi/README.md의 연결 절차를 따릅니다.
파이에서 표시한 코드를 앱에 로그인해 아가아이 연결하기 화면에 입력합니다.
카메라 AI 모델은 별도로 설치된 Sky Eye 모델을 사용합니다. 클라이언트는 카메라 상태와 안전 관측을 전송합니다.

## 검증

프론트엔드 폴더에서 npm.cmd test와 npm.cmd run build를 실행합니다.
화면 렌더링 검사는 node scripts/test-auth-ui.mjs와 node scripts/test-camera-ui.mjs로 실행합니다.
백엔드 폴더에서 powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1을 실행합니다.
파이 검사는 requirements.txt 의존성 설치 후 python -m unittest discover -s raspberry-pi -p "test_*.py"로 실행합니다.
