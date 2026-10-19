# 기능별 PR과 main 통합

기준: 2026-10-19. 대상 저장소: [graviny/cloud_aiot_agaeye](https://github.com/graviny/cloud_aiot_agaeye).

## 통합 PR

기존 PR #1은 main으로, PR #2~#5는 각각 앞 기능 브랜치로 병합되었습니다. 따라서 각 PR은 Merged 상태여도 main에는 웹 데모만 반영된 상태였습니다.

`integration/complete-agaeye` → `main` 통합 PR은 이미 검토·병합된 모델·클라우드·보호자 로그인·파이 배포 기능을 main에 모읍니다. 최신 main에서 통합 브랜치를 만들고 전체 기능이 들어 있는 `feat/guardian-cloud-web`의 PR #5 병합 결과를 가져왔습니다. 구조도와 README 연결도 포함합니다.

**이 통합 PR을 main으로 한 번 병합하면 전체 코드가 main에 반영됩니다.** 통합 PR을 만드는 작업에서 main을 직접 수정하거나 원래 기능 브랜치를 강제로 덮어쓰지 않습니다. Render 배포·Supabase 실계정 연결은 병합 이후 별도로 설정합니다.

## 기존 기능 PR 기록

| PR | 기능 | 실제 병합 대상 |
| --- | --- | --- |
| [#1](https://github.com/graviny/cloud_aiot_agaeye/pull/1) | 모니터링·위험 사진·이력 데모 | `main` |
| [#2](https://github.com/graviny/cloud_aiot_agaeye/pull/2) | 실제 ONNX 노트북 데모·기기 API | `feat/web-monitoring-demo` |
| [#3](https://github.com/graviny/cloud_aiot_agaeye/pull/3) | 인증 FastAPI·Supabase·Docker | `feat/local-ai-demo` |
| [#4](https://github.com/graviny/cloud_aiot_agaeye/pull/4) | 보호자 로그인·인증 SSE·사진 | `feat/cloud-api-storage` |
| [#5](https://github.com/graviny/cloud_aiot_agaeye/pull/5) | 파이 통신·Render 설정·팀 문서 | `feat/guardian-cloud-web` |

새 기능은 최신 main에서 브랜치를 만들어 main 대상으로 PR을 여는 것을 기본으로 합니다. 의존 브랜치 위에 PR을 쌓아야 한다면 앞 PR이 병합된 후 다음 PR의 기준 브랜치를 main으로 바꾸고 차이를 확인합니다. 이전 기능 브랜치로만 병합하면 main에는 자동 반영되지 않습니다.

## 실행·검증

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:agaeye
.\.venv-ai\Scripts\python.exe -m pip install -r cloud/requirements.txt
npm.cmd run test:cloud:api
npm.cmd run test:cloud
```

Node.js와 Python 준비는 각 실행 안내를 따릅니다. 실제 모델 시험에는 팀이 별도 제공한 ONNX가 필요합니다. Supabase 실계정/RLS, Docker 이미지 빌드, Render 배포, 라즈베리파이 하드웨어는 자동 검증과 별도로 확인합니다.

모델 가중치·개인 영상·실제 위험 사진·비밀 환경 파일·가상 환경·ZIP은 커밋하지 않습니다. `vendor/aga-eye`의 MIT 라이선스와 출처를 보존합니다. 브라우저 테스트의 JPEG는 직접 만든 테스트 그림입니다.
