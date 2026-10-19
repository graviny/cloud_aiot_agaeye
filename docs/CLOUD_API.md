# 클라우드 API

Render 등에서 `Dockerfile`로 실행하는 단일 worker FastAPI 서버입니다. 모델 추론은 포함하지 않으며 Supabase REST·Storage에 최신 상태, 이벤트, 확인, 설정과 비공개 JPEG를 저장합니다.

## 설정

1. Supabase SQL Editor에서 `supabase/migrations/001_agaeye.sql`을 실행합니다.
2. Supabase Auth에 보호자 앱 사용자를 등록합니다.
3. `.env.cloud-server.example`을 `.env.cloud-server.local`로 복사하고 서버 URL·서비스 키·보호자 UID·기기 토큰·CORS origin을 입력합니다.

서비스 키와 기기 키를 프론트엔드의 `VITE_` 변수에 넣지 않습니다. 보호자 사용자 1명·파이 1대를 지원합니다.

```powershell
.\.venv-ai\Scripts\python.exe -m pip install -r cloud/requirements.txt
node scripts/cloud-python.mjs -m uvicorn cloud.app:production_app --factory --env-file .env.cloud-server.local --host 127.0.0.1 --port 8002 --workers 1 --no-access-log
npm.cmd run test:cloud:api
```

인증된 `/readyz`는 네 테이블과 비공개 버킷을 검사합니다. `/healthz`는 프로세스 기동 확인입니다.

보호자 토큰은 Supabase `/auth/v1/user`로 검증하고 UID를 확인합니다. 기기 토큰으로 보호자 조회·확인을 할 수 없습니다. 저장 실패는 503으로 응답하며, 확인·위험 종료가 재전송으로 되돌아가지 않습니다. 서버 재시작 시 진행 중 위험·상태·설정을 복원합니다.

SSE는 단일 프로세스 구독을 사용합니다. 여러 worker/복제본은 지원하지 않습니다. 오프라인 테스트는 저장소 대역을 사용하므로 실제 Supabase/RLS 및 Docker 빌드 검증은 배포 후 별도로 필요합니다.
