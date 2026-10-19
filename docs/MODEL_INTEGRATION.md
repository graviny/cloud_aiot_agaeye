# 선택한 모델 저장소와 웹 연결하기

이 문서는 원본 **로컬 개발 서버**의 연결 계약을 설명합니다. Supabase에 지속 저장하고 보호자 인증을 적용하는 클라우드 모드는 [클라우드 배포 안내](CLOUD_DEPLOYMENT.md)를 따릅니다.

작성일: 2026-10-14

대상: [wlsdn66597/aga-eye](https://github.com/wlsdn66597/aga-eye)
확인한 커밋: `65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3`

이 문서는 위 커밋의 소스 코드를 읽고 작성했습니다. 저장소가 바뀌면 API 차이를 다시 확인해야 합니다. 모델 학습·추론이나 실제 라즈베리파이 시험을 실행한 결과가 아닙니다.

## 현재 노트북 시연 업데이트

2026-10-14 별도로 제공받은 `aga-eye-model-v1.tar.gz`에서 학습된 ONNX·원본 `.pt`를 확보했습니다. `start-ai-demo.cmd`로 노트북의 실제 웹캠·영상 분석을 실행할 수 있습니다. 실행·설치·검증 결과는 [노트북 실제 모델 데모 안내](LAPTOP_AI_DEMO.md)를 먼저 확인하세요. 아래 내용은 최종 Pi 연결과 원본 저장소 API의 설명입니다.

## 원본 저장소의 범위

이 저장소에는 YOLOv8n 학습·평가 코드, 라즈베리파이용 ONNX Runtime 추론, 위험 시간 판정, HTTP 전송, FastAPI 개발 서버가 있습니다. 기존 React 화면을 유지하면서 이 FastAPI의 형식을 읽는 `agaeye` 연결 모드를 추가했습니다.

**학습된 `.onnx`·`.pt` 가중치는 확인한 Git 트리에 없습니다.** 모델 담당자가 학습·내보낸 파일을 따로 전달해야 합니다. 설정의 기본 후보는 `models/agaeye_A_original_320_aug.onnx`이며 실제 전달받은 파일명과 입력 크기를 맞춥니다.

일반 `npm.cmd run dev`의 기본값은 `mock`입니다. 실제 노트북 시연은 고정된 원본 실행 코드(`vendor/aga-eye`)와 전용 `.venv-ai`를 사용하며 실제 FastAPI·웹캠·영상 연결을 확인했습니다. Pi 연결은 아직 실행하지 않았습니다.

## 각 장치가 하는 일

1. **라즈베리파이:** 카메라 프레임 → ONNX 추론 → 자세·코입 상태 → 위험 지속·종료 판정 → 상태·이벤트·위험 순간 JPEG 전송.
2. **노트북 FastAPI:** 생존 신호 수신, 연결 끊김 감지, 이벤트·사진 보관, 보호자 확인 저장, SSE 전달.
3. **노트북 React 웹:** 현재 상태·위험 사진·이력 표시, 보호자 확인 POST. 브라우저에서 모델을 불러오지 않습니다.

외부 클라우드나 Supabase가 필수인 구조는 아닙니다. 저장소의 현재 서버는 메모리에 저장하므로 재시작하면 기록과 사진이 사라집니다. 지속 보관이 필요할 때 로컬 DB·파일 저장을 추가합니다.

## 서로 다른 API를 맞춘 방법

| 항목 | 기존 자체 초안 `api` 모드 | 선택 저장소 `agaeye` 모드 |
| --- | --- | --- |
| 기기 상태 | `/api/status` | `/devices/{device_id}/status` |
| 이력 | `/api/events` → `{events: [...]}` | `/events` → 배열 |
| 실시간 | `/api/stream`, 이름 있는 `status`, `risk-event` | `/stream`, 이름 없는 메시지의 `type`이 `device`, `event` |
| 확인 | `/api/events/{id}/ack` | `/events/{event_id}/ack`, `{guardian: "보호자"}` |
| 시각 | ISO 8601 문자열 | Unix 초 → 웹에서 ISO 문자열로 변환 |
| 상태 | `danger`, `unknown` | `risk`, `unavailable`을 변환 |
| 사진 | 전달받은 URL | `has_snapshot`이 true면 `/events/{id}/snapshot` 구성 |

`src/data/agaEyeMapping.ts`가 서버 데이터를 화면 타입으로 변환하고, `agaEyeSource.ts`가 REST·SSE·확인 요청을 처리합니다. `source.ts`가 모드를 선택합니다. 예전 `/api` 초안도 유지하지만, **이번 저장소를 연결할 때는 `VITE_DATA_MODE=agaeye`를 사용**합니다.

Vite의 `/agaeye-api` 프록시는 경로 앞부분을 제거해 노트북 서버로 보냅니다. 예를 들어 브라우저의 `/agaeye-api/devices/crib-01/status`는 FastAPI의 `/devices/crib-01/status`가 됩니다. `.env.local`의 `API_PROXY_TARGET`도 읽도록 설정했습니다.

## 팀원 실행 순서

### 1. 노트북에 모델 저장소의 개발 서버 준비

웹 프로젝트 `AIOT`를 덮어쓰지 말고 다른 폴더에서 모델 저장소를 관리합니다. 아래는 Windows용 Python이 설치된 환경의 예시이며, 아직 자동으로 실행한 작업은 아닙니다.

```powershell
cd "C:\Users\user\Desktop\2026\SSU"
git clone https://github.com/wlsdn66597/aga-eye.git
cd aga-eye
python -m venv .venv-server
.\.venv-server\Scripts\python.exe -m pip install -r requirements-server.txt
.\.venv-server\Scripts\python.exe -m uvicorn server.app:app --host 0.0.0.0 --port 8000
```

서버 준비에는 `requirements-server.txt`만 사용합니다. 이 노트북 서버를 띄우는 데 학습용 PyTorch·CUDA·모델 가중치는 필요하지 않습니다. 서버의 기본 웹은 `http://127.0.0.1:8000`이며, 우리가 만든 React 웹은 5173에서 별도로 실행합니다.

Pi가 노트북으로 보낼 수 있도록 같은 LAN에 연결하고 노트북의 LAN IP를 확인합니다. 필요한 경우 로컬 네트워크용 방화벽 규칙을 맞춥니다. 저장소의 개발 서버에는 인증이 없으므로 해당 저장소의 안내대로 인터넷에 공개하지 않습니다.

### 2. React 웹의 연결 모드 설정

```powershell
cd "C:\Users\user\Desktop\2026\SSU\AIOT"
Copy-Item .env.agaeye.example .env.local
```

기존 `.env.local`이 있다면 덮어쓰기 전에 필요한 값을 반영합니다. 템플릿 내용은 다음과 같습니다.

```dotenv
VITE_DATA_MODE=agaeye
VITE_DEVICE_ID=crib-01
VITE_API_BASE_URL=
API_PROXY_TARGET=http://127.0.0.1:8000
VITE_STALE_AFTER_MS=12000
```

실행 중인 Vite를 해당 터미널에서 `Ctrl+C`로 종료한 뒤 `npm.cmd run dev`로 **한 번만** 재시작합니다. `start-local.cmd`는 기존 서버를 재사용하므로 이미 실행 중인 서버의 환경변수까지 바꿔주지는 않습니다.

브라우저에서 `http://127.0.0.1:5173`을 엽니다. 서버만 켜져 있고 Pi가 아직 연결되지 않았다면 ‘기기의 첫 연결을 기다리고 있어요’가 정상 동작입니다. 이 경우 데모 결과로 대신 표시하지 않습니다.

기본 프록시 사용 시 `VITE_API_BASE_URL`은 비워 둡니다. 직접 다른 출처의 서버 URL을 넣으려면 별도의 CORS 설정이 필요하며, 선택 저장소의 현재 서버에는 그 설정이 없습니다. Vite 개발 프록시는 배포 빌드에 포함되지 않으므로 배포 시 별도 프록시 또는 같은 출처 제공이 필요합니다.

### 3. 라즈베리파이에서 실제 분석 실행

모델 담당자가 [저장소 README의 Pi 준비 절차](https://github.com/wlsdn66597/aga-eye/blob/65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3/README.md)를 따르고 `.onnx` 파일을 Pi에 복사합니다. 가상환경을 켠 모델 저장소 폴더에서 실행합니다.

```bash
python edge/run_edge.py --source picamera2 \
  --model models/agaeye_A_original_320_aug.onnx --imgsz 320 \
  --device-id crib-01 --server http://노트북의_LAN_IP:8000
```

Pi의 `--server`에는 노트북 LAN IP를 넣습니다. Pi에서 `127.0.0.1`은 Pi 자신입니다. `--device-id`와 웹의 `VITE_DEVICE_ID`를 일치시키고 두 장치의 시간을 동기화합니다.

데모로 돌아가려면 `.env.local`에서 `VITE_DATA_MODE=mock`으로 바꾸고 Vite를 다시 시작합니다.

## 모델 결과와 화면 상태의 의미

| 저장소 값 | 화면 처리 |
| --- | --- |
| `normal` + 유효한 아기 결과 | 정상 |
| `caution` | 주의 |
| `risk` | 위험 |
| `unavailable`, 어두움, 유효한 입력 없음 | 판단 불가 |
| `reason: no_baby` | 아기 미감지, 위험 여부 판단 불가 |
| 몸 박스가 없지만 `airway_covered` 감지 | 아기 미감지로 바꾸지 않음. 저장소의 얼굴 가림 판단을 유지 |
| `online: false` | Pi 단절. 마지막 정상 결과를 현재 상태로 표시하지 않음 |
| 생존 신호는 오지만 `ts`가 12초 넘게 정지 | 입력·분석 갱신 중단. 카메라·아기·위험을 판단 불가로 처리 |

저장소는 `supine`, `side`, `prone`, `airway_visible`, `airway_covered`의 5개 클래스를 사용합니다. 위험 유형은 `prone`과 `face_covered`이며, 둘이 함께 잡히면 저장소가 엎드림을 우선합니다. 웹이 임의로 `combined` 이벤트를 만들어내지 않습니다.

진행 중인 사진은 상태의 `active_event_id`와 일치하는 이벤트만 사용합니다. 이력이 늦게 오면 다른 과거 사진을 현재 위험 사진으로 사용하지 않고 사진 대기 안내를 표시합니다. 위험이 해소되기 전에 입력이 끊기면 현재 판정은 판단 불가가 되지만 종료 미확인 기록은 남습니다. 보호자 확인은 종료로 바꾸지 않습니다.

### 확인한 기본 시간 설정

- 위험 확정: 5초, 정상 지속 후 위험 종료: 3초.
- 짧은 탐지 누락·분석 공백 허용: 각 1초.
- 생존 신호: 2초, 서버의 Pi 무응답 판정: 8초.
- 1차 후 미확인·위험 지속 시 2차: 15초.
- Pi 추론 설정: 초당 3회 후보. 실제 FPS와 지연은 Pi에서 측정해야 합니다.
- 웹의 오래된 분석 판정: 12초 기본값. 모델 위험 확정 시간과 다른 값입니다.

이 값은 선택 저장소의 개발 기본값이며 과목 명세의 성능 요구사항을 충족했다는 뜻이 아닙니다. 서버 연결 후 위험 기준 시간은 서버 설정이 Pi의 로컬 설정보다 우선합니다.

## 모델·백엔드 담당자와 추가로 맞출 부분

1. **카메라 자체 진단:** 현재 메시지는 별도 `camera_status`가 없습니다. 웹은 새 `ts`를 실제 프레임 처리의 근거로 사용합니다. 카메라 고장과 추론 정지를 정확히 구분하려면 `camera_status`, `last_frame_at`, `last_analysis_at` 등을 별도로 보내야 합니다.
2. **사진 촬영 시각:** 현재 이벤트에는 별도 촬영 시각이 없습니다. 웹은 위험 확정 시각을 촬영 시각으로 복사하지 않고 ‘촬영 시각 미제공’으로 표시합니다. 모델 담당자가 Unix 초의 `captured_at`을 추가하고 서버가 목록·SSE·확인 응답에 보존하면 웹 변환 코드가 그 값을 사용합니다.
3. **종료만 수신한 기록:** 서버는 시작 이벤트를 못 받았어도 종료 기록을 만들 수 있지만, 그 기록에는 `started_at`, `confirmed_at`이 없을 수 있습니다. 웹은 없는 시각을 지어내지 않고 이력 형식 오류를 표시합니다. 서버가 완전한 기록을 복구하거나 ‘시작 시각 미상’을 표현하는 계약을 별도 합의해야 합니다.
4. **영구 저장:** 현재 서버의 이벤트·사진은 메모리입니다. 앱 재시작 후 보관이 필요하면 DB와 사진 파일 저장을 추가합니다.
5. **사진의 뒤늦은 추가:** 현재 서버는 같은 시작 이벤트 재전송을 중복으로 무시합니다. 사진이 나중에 도착하는 별도 업데이트 API는 없습니다. 현재 코드는 `has_snapshot: false`를 로딩 중으로 추정하지 않고 사진 없음으로 표시합니다.
6. **여러 장치·많은 기록:** 웹은 설정한 단일 장치만 사용하며 서버 전체 최신 200건에서 해당 장치를 거릅니다. 전체 기록 페이지네이션·여러 장치 선택은 후속 작업입니다.
7. **2차 알림 UI·웹 PUSH:** 서버의 `alert`, `settings` 메시지는 현재 화면 상태로 변환하지 않습니다. 기존 위험 경보는 표시하지만 1·2차 별도 알림함·설정 화면·닫힌 브라우저 PUSH는 추가 구현 대상입니다.

## 검사와 실제 연결 시 확인 순서

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:agaeye
```

검사는 순서대로 실행합니다. `test:agaeye`는 Node 기반 규격 테스트 서버(8011)와 별도 Vite(5174)를 자동으로 시작·종료하며 기존 5173 데모를 사용하지 않습니다. 모델·카메라·Python 서버를 실행하지 않고 테스트 이미지로 API 연결을 확인합니다.

실제 연결 시에는 정상 → 엎드림/얼굴 가림 → 사진 조회 → 보호자 확인 후 위험 유지 → 모델 종료 → 카메라/Pi 단절 → 복구 순서로 확인합니다. 실제 처리 속도·위험 누락률·알림 지연도 별도로 측정합니다.

## 확인한 원본

- [모델·라즈베리파이 준비 안내](https://github.com/wlsdn66597/aga-eye/blob/65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3/README.md)
- [엣지·서버·웹 API](https://github.com/wlsdn66597/aga-eye/blob/65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3/docs/api.md)
- [현재 FastAPI 구현](https://github.com/wlsdn66597/aga-eye/blob/65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3/server/app.py)
- [Pi 실행·상태 전송](https://github.com/wlsdn66597/aga-eye/blob/65d672cbbdc052b9e8ce1d08c2bcf9d96ba76fa3/edge/run_edge.py)
