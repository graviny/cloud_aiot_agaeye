# 아가 아이 · Cloud AIoT

라즈베리파이에서 아기의 수면 자세를 분석하고, 보호자 웹에서 현재 상태·위험 발생 사진·확인 기록을 조회하는 프로젝트입니다. 실제 클라우드 배포와 파이 연결에는 별도의 계정·장치 설정이 필요합니다.

## 실행 모드

| 모드 | 용도 | 준비 |
| --- | --- | --- |
| `mock` | 화면·위험 시나리오 데모 | Node.js |
| `agaeye` | 모델 팀의 FastAPI·SSE 연결 | 기기 API 서버 |
| 실제 모델 노트북 데모 | ONNX CPU로 웹캠·영상 분석 | Python 환경·별도로 받은 모델 |
| `cloud` | 보호자 로그인·클라우드 상태·비공개 사진 | Supabase 설정·Docker API |

기본값은 `mock`입니다. 확인 버튼은 보호자가 상황을 인지했다는 기록이며 위험 종료와 별도로 관리합니다. 연결이 끊기거나 분석 결과가 오래되면 현재 상태를 정상으로 표시하지 않습니다.

## 먼저 화면 실행

Node.js 22.12 이상(22 계열) 또는 Node.js 24 LTS를 설치하고 저장소를 복제합니다.

```powershell
git clone https://github.com/graviny/cloud_aiot_agaeye.git
cd cloud_aiot_agaeye
npm.cmd ci
npm.cmd run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에서 확인합니다. Windows에서는 `start-local.cmd`로도 실행할 수 있습니다. macOS/Linux에서는 `npm.cmd` 대신 `npm`을 사용합니다. 개발용 시나리오 패널에서 위험·단절·사진 실패·복구를 시험할 수 있으며 예시 사진은 직접 만든 SVG입니다.

## 실제 모델 노트북 데모

모델 담당자에게 받은 `agaeye_A_original_320_aug.onnx`를 `models/`에 복사합니다. Windows에서 `setup-ai-demo.cmd`로 전용 환경을 준비한 뒤 `start-ai-demo.cmd`로 실행합니다. CPU 추론을 사용하며 웹에서 웹캠·영상 입력을 선택합니다.

**모델 가중치·개인 영상·실제 위험 사진은 Git 저장소에 없습니다.** 모델 출처와 무결성 정보는 [모델 안내](models/README.md)를 확인하세요. 원본 추론 코드는 `vendor/aga-eye`에 커밋을 고정해 포함하고 원본 MIT 라이선스를 보존합니다.

[모델 데모 설치·실행](docs/LAPTOP_AI_DEMO.md) · [기기 API 연결](docs/MODEL_INTEGRATION.md)

## 클라우드·파이 연결

최종 흐름은 라즈베리파이 AI 분석 → Render Docker API → Supabase DB·비공개 사진 → 보호자 React 웹입니다. 연속 영상은 클라우드에 올리지 않습니다. 실시간 전달은 SSE이며 웹을 닫은 상태의 Web Push는 아직 구현하지 않았습니다.

[클라우드 배포 안내](docs/CLOUD_DEPLOYMENT.md)의 Supabase 프로젝트·보호자 계정·환경 변수·Render·파이 설정 순서를 따르세요. 공개 키는 웹에, 서비스 키는 서버에, 기기 토큰은 파이에만 설정합니다. 실제 배포는 PR 병합만으로 자동 실행되지 않습니다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:agaeye
```

클라우드 검증은 전용 Python 환경에 `cloud/requirements.txt`를 설치한 뒤 `npm.cmd run test:cloud:api`, `npm.cmd run test:cloud`를 실행합니다. Windows 브라우저 검증은 Microsoft Edge를 사용하며 다른 환경은 Playwright Chromium 설치가 필요합니다.

자동 테스트의 로그인·저장소는 테스트 대역입니다. 실제 Supabase/RLS, Docker 이미지, Render 배포, 라즈베리파이 하드웨어는 배포 환경에서 별도로 검증합니다.

## 팀 문서

- [기능별 PR 검토·병합 순서](docs/PR_GUIDE.md)
- [팀 개발 안내](docs/TEAM_GUIDE.md)
- [클라우드 API](docs/CLOUD_API.md) · [보호자 웹](docs/CLOUD_WEB.md)
- [데이터 계약 초안](docs/API_CONTRACT.md)
- [검증 기록과 범위](docs/VALIDATION.md)
