# API 및 데이터 계약 초안 v0.1

작성일: 2026-10-13

**이 문서는 기존 자체 `/api` 계약 초안과 화면 내부 타입을 설명합니다.** 2026-10-14 선택한 `wlsdn66597/aga-eye`의 실제 서버 API는 아래 경로·필드와 다릅니다. 해당 저장소 연결에는 `VITE_DATA_MODE=agaeye`와 [모델 연결 안내](MODEL_INTEGRATION.md)를 사용합니다. `agaEyeMapping.ts`가 실제 서버 형식을 이 화면 타입으로 변환하므로 모델 서버를 아래 초안대로 다시 만들 필요는 없습니다.

실제 노트북 데모는 원본 FastAPI를 `vendor/aga-eye/`에 고정하고 `scripts/laptop_api.py`로 입력 제어를 확장합니다. 그 API는 [노트북 데모 안내](LAPTOP_AI_DEMO.md)와 [모델 연결 안내](MODEL_INTEGRATION.md)를 따릅니다. `src/data/apiSource.ts`는 기존 자체 `api` 모드용 코드입니다.

## 연결 범위

브라우저는 노트북 FastAPI에 접속합니다. FastAPI는 라즈베리파이의 분석 결과를 받아 브라우저용 형식으로 제공합니다. 선택 저장소의 라즈베리파이 → FastAPI 업로드는 해당 저장소의 `docs/api.md`를 따릅니다. 아래 `/api` 항목은 자체 서버를 만드는 경우의 이전 초안입니다.

브라우저에서는 모델을 실행하지 않습니다. 위험 지속 시간과 위험 종료는 라즈베리파이에서 판정하고, 노트북 서버는 결과를 전달합니다.

## 공통 규칙

- JSON 키는 현재 TypeScript 타입과 같은 camelCase를 사용합니다.
- 모든 시각은 시간대가 포함된 ISO 8601 문자열을 사용합니다. 예: `2026-10-13T01:00:00+09:00` 또는 UTC `...Z`.
- 브라우저는 표시할 때 사용자의 로컬 시간대로 변환합니다.
- `updatedAt`은 분석 결과의 실제 갱신 시각입니다. 서버에서 이전 값을 재전송할 때 현재 시각으로 덮어쓰지 않습니다.
- 선택 저장소 모드의 `activeEventId`는 현재 위험의 ID 또는 null이며 해당 사진을 선택하는 데 사용합니다. 기존 모의 데이터에서는 생략 가능합니다.
- 기기·서버 시각을 동기화해야 합니다. 프론트엔드는 수신 시각과 결과 시각을 모두 보고 갱신 중단을 판단합니다.
- 아직 알 수 없는 시각이나 사진은 빈 문자열 대신 `null`로 전달합니다.
- `event.id`는 위험 한 건의 고유 ID입니다. 재전송, 확인, 종료 갱신에도 같은 ID를 유지합니다.
- 종료와 확인은 독립된 필드이며, 갱신된 이벤트는 전체 객체로 전달합니다.
- 같은 이벤트 ID의 확인·종료 시각은 설정된 뒤 null로 되돌리지 않습니다. 프론트엔드도 오래된 재전송 때문에 이미 받은 확인·종료 기록이 사라지지 않도록 병합합니다.
- 목록은 현재 초기 단일 장치 범위에서 전체 반환합니다. 페이지네이션은 추후 협의합니다.

## API 목록

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| GET | `/api/status` | `DeviceStatus` 객체 |
| GET | `/api/events` | `{ "events": RiskEvent[] }` |
| GET | `/api/stream` | `text/event-stream` 형식 SSE |
| POST | `/api/events/{id}/ack` | 확인 시각이 반영된 전체 `RiskEvent` 객체 |
| GET | `/api/events/{id}/snapshot` | 이미지 바이너리와 알맞은 Content-Type |

현재 상세 화면은 목록에서 수신한 전체 이벤트 객체를 사용합니다. 별도 이벤트 상세 API는 필수가 아니며, 목록을 요약형으로 바꾸면 함께 추가해야 합니다.

현재 인증·인가 구현은 없습니다. 실제 사용자·사진을 연결할 때는 백엔드에서 접근 통제를 추가해야 합니다. API 연결 코드는 동일 출처 쿠키 요청을 지원하도록 `credentials: include`를 사용합니다. 토큰 인증이 필요하면 데이터 연동 계층에서 추가합니다.

## 상태 객체

```json
{
  "deviceId": "pi-nursery-01",
  "server": "connected",
  "pi": "connected",
  "camera": "ok",
  "analysis": "running",
  "baby": "present",
  "risk": "normal",
  "riskKind": null,
  "updatedAt": "2026-10-13T01:00:00+09:00",
  "lastFrameAt": "2026-10-13T01:00:00+09:00",
  "lastAnalysisAt": "2026-10-13T01:00:00+09:00"
}
```

| 필드 | 허용 값 | 의미 |
| --- | --- | --- |
| `server` | `connected`, `connecting`, `delayed`, `disconnected` | API가 보고하는 서비스 상태. 실제 브라우저 연결 실패는 프론트엔드에서 별도로 감지 |
| `pi` | 위와 동일 | 서버가 감시하는 라즈베리파이 연결 상태 |
| `camera` | `ok`, `error`, `disconnected`, `unknown` | 프레임 입력 상태. Pi 연결 여부와 별개 |
| `analysis` | `running`, `unavailable` | 유효한 분석 수행 여부 |
| `baby` | `present`, `absent`, `unknown` | 아기 감지, 미감지, 판단 불가 |
| `risk` | `normal`, `caution`, `danger`, `unknown` | 현재 위험 판정 |
| `riskKind` | `prone`, `face_covered`, `combined`, `null` | 엎드림, 안면 차폐, 복합 위험, 해당 없음 |

연결된 서버에서 정상 응답이 와도 카메라·Pi·분석 상태가 비정상이거나 데이터가 오래됐으면 화면은 위험 여부를 판단 불가로 표시합니다. 마지막 프레임·분석 시각은 그대로 남겨 원인을 확인할 수 있게 합니다.

## 위험 이벤트 객체

```json
{
  "id": "pi-nursery-01-20261013-0001",
  "deviceId": "pi-nursery-01",
  "kind": "prone",
  "startedAt": "2026-10-13T01:00:00+09:00",
  "confirmedAt": "2026-10-13T01:00:10+09:00",
  "endedAt": null,
  "acknowledgedAt": null,
  "photoUrl": "/api/events/pi-nursery-01-20261013-0001/snapshot",
  "photoState": "available",
  "capturedAt": "2026-10-13T01:00:10+09:00",
  "isExample": false,
  "delayed": false
}
```

| 필드 | 규칙 |
| --- | --- |
| `endedAt` | 진행 중이면 null. 위험 종료 후 실제 종료 시각. 보호자 확인으로 바꾸지 않음 |
| `acknowledgedAt` | 미확인 시 null. 서버가 확인 저장에 성공한 시각 |
| `photoUrl` | 이미지 조회 URL. 운영체제 파일 경로는 사용하지 않음 |
| `photoState` | `available`, `loading`, `missing`. 이미지 HTTP 실패는 브라우저에서 별도 표시 |
| `capturedAt` | 사진 촬영 시각. 아직 사진이 없으면 null 가능 |
| `isExample` | 실제 촬영 사진은 false, 데모 그림은 true |
| `delayed` | 단절 후 과거 이벤트를 복구한 경우 true. 현재 위험 여부는 상태 객체와 종료 시각으로 판단 |

사진 조회가 늦어도 위험 상태·이벤트를 먼저 전달합니다. 사진 업로드가 완료되면 같은 이벤트 ID의 전체 객체를 다시 전달해 `photoState`와 URL을 갱신합니다.

## SSE 전달 규칙

상태는 `status`, 이벤트는 `risk-event`라는 이름으로 보냅니다. 상태 객체는 기본적으로 2초 정도 간격으로 전달하는 것을 제안합니다. 정확한 간격은 팀에서 합의하며, 프론트엔드의 기본 갱신 중단 기준은 12초입니다.

```text
event: status
data: {"deviceId":"pi-nursery-01","server":"connected","pi":"connected","camera":"ok","analysis":"running","baby":"present","risk":"normal","riskKind":null,"updatedAt":"2026-10-13T01:00:00+09:00","lastFrameAt":"2026-10-13T01:00:00+09:00","lastAnalysisAt":"2026-10-13T01:00:00+09:00"}

event: risk-event
data: {"id":"pi-nursery-01-20261013-0001","deviceId":"pi-nursery-01","kind":"prone","startedAt":"2026-10-13T01:00:00+09:00","confirmedAt":"2026-10-13T01:00:10+09:00","endedAt":null,"acknowledgedAt":null,"photoUrl":null,"photoState":"loading","capturedAt":null,"isExample":false,"delayed":false}

```

각 메시지 끝에는 빈 줄이 필요합니다. 서버에서는 응답 버퍼링을 피하고 `Content-Type: text/event-stream`을 설정합니다.

위험 확정 시 `risk: danger` 상태와 같은 위험의 이벤트 객체를 함께 전달합니다. 상태가 먼저 도착하면 프론트엔드는 사진 없이 텍스트 경보를 우선 표시합니다.

브라우저 EventSource는 연결 실패 시 재연결합니다. 다시 열리면 프론트엔드는 상태와 이력을 REST로 조회해 빠진 이벤트를 보충합니다. 초기 범위에서는 `Last-Event-ID` 기반 재생 대신 최신 전체 이력 재조회로 동기화합니다.

## 환경변수와 연결

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=
API_PROXY_TARGET=http://127.0.0.1:8000
VITE_STALE_AFTER_MS=12000
```

위 설정으로 개발하면 브라우저는 Vite의 `/api` 주소를 사용하고 Vite가 FastAPI로 요청을 전달합니다. 다른 주소로 직접 연결하려면 `VITE_API_BASE_URL`을 지정하고 백엔드 CORS를 맞춰야 합니다. Vite 프록시는 개발 서버에서만 사용되므로 배포 빌드에서는 FastAPI가 웹 파일과 API를 같은 출처로 제공하거나 별도 프록시가 필요합니다.

## 실제 연결 전 확인

- 위험 확인 POST의 응답은 빈 204가 아니라 갱신된 이벤트 JSON인지
- `updatedAt`이 단순 서버 전송 시각으로 덮어써지지 않는지
- 프레임 입력 단절과 라즈베리파이 연결 단절을 별개로 감지하는지
- 사진 로딩 완료·위험 종료·확인 시 이벤트 전체 갱신이 전달되는지
- 중복·지연 이벤트와 재연결 후 전체 이력이 일관되는지
- 실제 촬영 사진은 `isExample: false`인지
- 실제 연결 환경의 인증, 사진 접근 권한, 저장·삭제 정책이 준비됐는지
