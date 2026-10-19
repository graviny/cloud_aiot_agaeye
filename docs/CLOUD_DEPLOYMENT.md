# 아가 아이 · Render + Supabase 배포 안내

작성: 2026-10-14. 기존 노트북 실제 모델 데모를 유지하면서 클라우드 모드를 추가했습니다.

**현재 단계는 코드·배포 설정 준비입니다. 실제 Render 배포, 사용자 Supabase 연결은 아직 하지 않았습니다.** Render 계정, 소스 Git 저장소, Supabase 프로젝트 설정이 필요합니다. 비밀 키·비밀번호를 문서·채팅·Git에 올리지 마세요.

## 구성과 모드

| 구성 | 역할 |
| --- | --- |
| 라즈베리파이 | ONNX CPU 분석, 위험 판정, 위험 확정 시 JPEG 한 장 전송 |
| Render Docker 서버 | 파이·보호자 인증, 상태·위험·확인 API, SSE 실시간 전달 |
| Supabase PostgreSQL | 최신 상태, 이벤트, 보호자 확인, 알림, 설정 저장 |
| Supabase Storage | 비공개 사진 저장, 인증된 API를 통해 조회 |
| Supabase Auth | 미리 등록한 보호자의 이메일·비밀번호 로그인 |
| Render Static Site | 현재 React 웹 배포 |

`VITE_DATA_MODE=cloud`를 사용합니다. 기존 `mock`, `agaeye`, `start-ai-demo.cmd`는 유지합니다. 클라우드에서 모델 추론·연속 영상 업로드는 하지 않습니다. 실시간 전달은 기존 **SSE**를 이어 쓰므로 Supabase Realtime 설정은 필요 없습니다. 웹을 닫은 상태의 **Web Push는 이번 범위에 포함하지 않았습니다.**

과제에서 파이 센서 → 엣지 AI → HTTPS → Docker 클라우드 서버 → DB·사진 → 웹 표시 흐름을 시연합니다. 수업에서 특정 클라우드를 지정했다면 해당 지침을 우선 확인하세요.

## 1. 기존 Supabase 계정 설정

프로젝트가 없다면 Free 플랜 프로젝트를 만듭니다.

처음 만드는 순서: [Supabase 대시보드](https://supabase.com/dashboard) → **New project** → 개인 Organization 선택(없으면 Free 조직 생성) → 이름 `aga-eye` → DB 비밀번호 직접 지정 → 가까운 지역 선택 → **Create new project**. Free 플랜인지 확인하고 준비 완료 후 아래 SQL 설정으로 넘어갑니다. DB 비밀번호는 이 앱의 로그인 비밀번호와 다르며 문서에 적지 않습니다.

1. **SQL Editor → New query**에서 `supabase/migrations/001_agaeye.sql` 전체를 실행합니다.
2. `agaeye_devices`, `agaeye_events`, `agaeye_alerts`, `agaeye_settings` 네 테이블과 RLS 활성화를 확인합니다. 기존의 다른 테이블은 변경하지 않습니다.
3. Storage의 `agaeye-snapshots` 버킷에서 **Public이 꺼져 있는지** 확인합니다.
4. **Authentication → Users → Add user / Create user**에서 보호자 이메일·비밀번호를 등록하고 이메일 확인을 완료합니다. **Supabase 관리 콘솔 계정과 별개의 앱 사용자입니다.**
5. 만든 앱 사용자의 **User UID(UUID)**를 복사합니다. 서버 `GUARDIAN_USER_ID`에 넣습니다.
6. 프로젝트 설정의 API/Connect에서 **Project URL**, **publishable key**, **secret key**를 확인합니다. 구형 키를 사용하는 프로젝트는 각각 `anon`, `service_role`입니다.

현재 버전은 **보호자 사용자 1명·파이 1대(crib-01)**를 지원합니다. 다른 계정으로 로그인해도 서버가 이 기기의 데이터 접근을 거부합니다. 여러 보호자는 후속 권한 테이블 확장이 필요합니다.

## 2. 소스 저장소

배포 소스는 [graviny/cloud_aiot_agaeye](https://github.com/graviny/cloud_aiot_agaeye)입니다. 기능별 PR이 기본 브랜치에 순서대로 병합되면 Render에서 이 저장소와 `render.yaml`을 연결합니다. 공개 저장소에는 모델 가중치·촬영 자료·비밀 환경 파일을 올리지 않습니다. 모델 팀의 원본 저장소와는 별개입니다.

`python scripts/package-cloud.py`로 만드는 `aga-eye-cloud-team.zip`은 배포용 소스 묶음입니다. **압축을 풀어 소스를 저장소에 올려야** Render가 빌드할 수 있습니다. 모델, 가상 환경, 실제 영상·사진, `.env.*.local`은 묶음에 포함하지 않습니다. 파이의 모델 파일은 기존에 받은 파일을 별도로 복사합니다.

## 3. Render 무료 배포

Render 가입 및 GitHub 연결 후 **New → Blueprint**에서 저장소와 루트의 `render.yaml`을 선택합니다. API는 **Free / Docker / Singapore**, 웹은 **Static Site**인지 확인합니다. 유료 DB·디스크는 만들지 않습니다. 자동 배포는 꺼 두었습니다.

API 서버 환경 변수:

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | `https://프로젝트ID.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret 또는 service_role 키. **서버 전용** |
| `GUARDIAN_USER_ID` | 보호자 앱 사용자의 UUID |
| `DEVICE_ID` | `crib-01` |
| `DEVICE_TOKEN` | Blueprint가 생성한 긴 임의 키. Render에서 확인해 파이에만 복사 |
| `CORS_ORIGINS` | 실제 웹 주소, 예: `https://aga-eye-web-xxxx.onrender.com` |

웹 환경 변수:

| 이름 | 값 |
| --- | --- |
| `VITE_DATA_MODE` | `cloud` |
| `VITE_DEVICE_ID` | `crib-01` |
| `VITE_API_BASE_URL` | 실제 API 주소, 예: `https://aga-eye-api-xxxx.onrender.com` |
| `VITE_SUPABASE_URL` | 서버와 같은 Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable 또는 anon 키. **secret/service_role 금지** |
| `VITE_STALE_AFTER_MS` | `12000` |

Render가 이름 뒤에 고유 문자를 붙일 수 있으므로 실제 서비스 화면의 URL을 복사합니다. 초기 단계에서 주소를 모르면 예상 URL로 생성한 뒤 실제 주소로 수정합니다. `CORS_ORIGINS`는 경로 없는 웹 origin만 넣으며 여러 origin은 쉼표로 구분합니다.

**API 설정을 바꾸면 API 재배포, VITE 설정을 바꾸면 웹 재빌드·배포**가 필요합니다. 서버는 SQL과 비공개 버킷이 준비돼야 정상 시작합니다. 먼저 Supabase 설정을 완료하세요.

공개 `GET /healthz`는 프로세스 기동 확인입니다. **로그인한 보호자의 토큰으로 `GET /readyz`가 성공해야 DB 네 테이블·비공개 버킷 연결도 확인**된 것입니다. 공개 health 응답만으로 저장소까지 정상이라고 판단하지 않습니다.

## 4. 파이 연결

기존 모델 실행 환경(Python, OpenCV, ONNX Runtime, Picamera2 등)에 `python-dotenv`를 추가합니다. 모델은 프로젝트 `models/agaeye_A_original_320_aug.onnx`에 둡니다.

`.env.pi.example`을 `.env.pi.local`로 복사하고 API 주소·기기 ID·Render의 `DEVICE_TOKEN`을 입력합니다. 이 파일은 파이에서만 보관하며 Git에 올리지 않습니다.

```bash
python -m pip install 'python-dotenv>=1.0,<2'
python scripts/run-pi-cloud.py --check
python scripts/run-pi-cloud.py --source picamera2
```

USB 웹캠은 `--source 0`, 다른 모델 경로는 `--model /절대/경로/model.onnx`입니다. `--check`는 인증·통신만 검사하며 카메라·분석을 정상으로 표시하지 않습니다.

**클라우드에는 새 래퍼를 사용합니다.** 원본 `vendor/aga-eye/edge/run_edge.py`를 직접 실행하면 인증 헤더가 없어 401을 받습니다. 모델 팀의 원본 파일은 수정하지 않았습니다.

생존 신호는 5초마다, 위험 이벤트는 큐가 깨어나는 즉시 전송을 시도합니다. 서버는 생존 신호 20초 미수신 시 오프라인으로 표시합니다. 웹은 12초가 지난 분석을 정상으로 표시하지 않습니다. 파이와 노트북의 시간을 동기화하세요. 위험 종료와 보호자 확인은 별개의 기록입니다.

## 5. 본인 Supabase와 로컬 실행

기존 모델 데모는 계속 `start-ai-demo.cmd`로 실행합니다. 아래는 본인 Supabase에 연결하는 별도 클라우드 모드이며 웹 포트는 5176입니다.

```powershell
# 프로젝트 폴더에서 실행
.\.venv-ai\Scripts\python.exe -m pip install -r cloud\requirements.txt
Copy-Item .env.cloud-server.example .env.cloud-server.local
# .env.cloud-server.local을 열어 서버 설정을 직접 입력
node scripts/cloud-python.mjs -m uvicorn cloud.app:production_app --factory --env-file .env.cloud-server.local --host 127.0.0.1 --port 8002 --workers 1 --no-access-log
```

다른 터미널에서 `.env.cloud.example`을 `.env.local`로 복사해 공개 설정을 입력한 뒤 `npm.cmd run dev:cloud`를 실행합니다. 기존 `.env.local`이 있다면 덮어쓰기 전에 보관합니다. API는 `http://127.0.0.1:8002`, 웹은 `http://127.0.0.1:5176`입니다.

전용 Python 환경이 없으면 Python 3.12로 `.venv-cloud`를 만들고 `cloud/requirements.txt`를 설치합니다. `cloud-python.mjs`는 `.venv-cloud`, `.venv-ai` 순으로 찾으며 `AGAEYE_PYTHON`으로 실행 파일을 지정할 수도 있습니다.

Docker가 있는 PC에서는:

```bash
docker build -t aga-eye-api .
docker run --rm --env-file .env.cloud-server.local -p 127.0.0.1:8002:10000 aga-eye-api
```

Docker 이미지는 `cloud/`만 포함합니다. 모델·촬영 영상·비밀 설정을 복사하지 않습니다. 서버는 **worker 1개**로 실행하며 여러 worker·복제본은 지원하지 않습니다. 프로세스 내부 상태 캐시와 SSE 구독을 사용하기 때문입니다.

## 6. 저장·인증 구현 원칙

- 보호자 토큰은 Supabase `/auth/v1/user`로 확인하고, 설정된 UID와 일치해야 조회·확인·설정·SSE를 허용합니다. 파이 토큰으로 보호자 데이터 조회는 불가능합니다.
- SSE와 사진에 Authorization 헤더를 사용하고 토큰을 URL에 붙이지 않습니다. 사진은 인증 후 Blob URL로 표시하며 로그아웃하면 해제합니다.
- Storage는 비공개, 서비스 키는 서버 전용입니다. RLS는 자기 행만 읽게 제한하며 브라우저의 직접 쓰기는 허용하지 않습니다.
- 위험·확인·설정은 저장 성공 후 반영합니다. 실패는 503으로 응답합니다. 이벤트 ID로 중복 전송을 병합하고 종료·확인을 되돌리지 않습니다.
- 종료가 먼저 도착한 불완전 기록은 실제 시작 시각이 올 때까지 화면에서 제외하고 DB에는 보관합니다. 서버 재시작 시 최신 기기·설정·진행 중 위험을 복원합니다.
- 오래된 기기 분석을 현재 정상으로 표시하지 않습니다. 2차 알림도 최신 입력에서 위험이 계속되고 미확인인 경우에만 생성합니다.
- 파이의 미전송 큐는 원본처럼 메모리에 있습니다. **파이 재시작 시 미전송 이벤트가 사라질 수 있습니다.** 영구 전송 큐는 후속 작업입니다.

## 7. 무료 한도와 시연

Render 무료 서버는 월 750시간 한도, 15분간 요청이 없으면 대기, 다음 요청 때 약 1분 뒤 기동할 수 있습니다. 임의 재시작도 가능하므로 기록은 Supabase에 저장합니다. Supabase Free는 DB 500MB·사진 1GB 등의 한도가 있으며 1주일 미사용 시 프로젝트가 일시 중지될 수 있습니다.

사진·이력 자동 삭제는 아직 없습니다. 최신 상태를 덮어쓰고 위험 기록만 누적하며 연속 영상은 올리지 않습니다. 관리자 화면에서 용량을 확인하고 오래된 시연 사진을 삭제한 뒤 해당 DB 기록을 정리합니다. 무료 한도 초과 시 중지/과금 조건이 있으므로 무료 플랜과 사용량을 확인합니다. 이번 작업에서 유료 업그레이드는 하지 않습니다.

## 8. 팀 작업 위치

| 기능 | 파일 |
| --- | --- |
| 클라우드 API·SSE·위험 규칙 | `cloud/app.py` |
| Supabase HTTP·Storage | `cloud/store.py` |
| 서버 설정 검사 | `cloud/config.py` |
| DB·RLS·비공개 버킷 | `supabase/migrations/001_agaeye.sql` |
| Docker·배포 | `Dockerfile`, `.dockerignore`, `render.yaml` |
| 로그인 | `src/components/CloudGate.tsx`, `src/data/cloudAuth.ts` |
| 인증 SSE | `src/data/authenticatedStream.ts`, `src/data/agaEyeSource.ts` |
| 인증 사진 | `src/components/Photo.tsx` |
| 파이 실행·인증 | `scripts/run-pi-cloud.py`, `configs/pi-cloud.yaml` |

## 9. 검증과 실제 연결

명령: `npm.cmd test`, `npm.cmd run test:cloud:api`, `npm.cmd run test:cloud`, `npm.cmd run test:agaeye`, `npm.cmd run test:e2e`, `npm.cmd run build`.

클라우드 테스트는 실제 FastAPI 앱에 저장소 테스트 대역과 테스트 로그인 응답을 연결합니다. **사용자 계정의 실제 Supabase 연결, PostgreSQL RLS 실행, Render Docker 빌드, 파이 하드웨어 통신을 검증한 것은 아닙니다.** 현재 노트북에는 Docker 실행 파일이 없습니다. 이 검증은 계정 설정·배포 후 필요합니다.

배포 후 순서: `/healthz` → 보호자 로그인·`/readyz` → 파이 `--check` → 카메라 분석 → 웹 최신 상태 → 통제된 위험 시연·사진 → 보호자 확인 → 파이 중지 시 판단 불가 → API 재배포 후 이력 유지.

공식 문서: [Render Docker](https://render.com/docs/docker), [Blueprint](https://render.com/docs/blueprint-spec), [Render Free](https://render.com/docs/free), [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control), [Supabase 요금제](https://supabase.com/pricing).
