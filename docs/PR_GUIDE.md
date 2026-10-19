# 기능별 PR 검토·병합 안내

기준: 2026-10-19. 대상 저장소: https://github.com/graviny/cloud_aiot_agaeye.

| 순서 | 브랜치 | 검토 범위 | 기준 브랜치 |
| --- | --- | --- | --- |
| 1 | `feat/web-monitoring-demo` | 현재 상태·위험 사진·이력·모의 시나리오 | `main` |
| 2 | `feat/local-ai-demo` | 실제 ONNX 노트북 데모·기기 API·원본 추론 코드 고정 | `feat/web-monitoring-demo` |
| 3 | `feat/cloud-api-storage` | 인증 FastAPI·Supabase DB/Storage·Docker | `feat/local-ai-demo` |
| 4 | `feat/guardian-cloud-web` | 보호자 로그인·인증 SSE·비공개 사진 | `feat/cloud-api-storage` |
| 5 | `feat/pi-render-deployment` | 파이 인증 전송·Render 설정·팀 배포 문서 | `feat/guardian-cloud-web` |

각 PR은 앞 기능을 기반으로 하므로 순서대로 검토합니다. **1번부터 병합한 뒤 다음 PR의 기준 브랜치를 `main`으로 변경**하고, 차이가 해당 기능만 남았는지 확인해 병합합니다. 전체 검토를 끝내기 전에는 의존 브랜치를 지우지 마세요.

앞 PR을 squash/rebase로 병합하면 뒤 PR에 기존 커밋이 다시 보일 수 있습니다. 이 경우 다음 브랜치에 `main`을 단순 병합하는 대신 해당 기능 커밋만 새 `main` 위로 옮기는 rebase가 필요합니다. 팀에서 일괄 검토 후 순서대로 일반 merge commit을 사용하는 편이 단순합니다.

모델 가중치·개인 영상·실제 위험 사진·`.env.*.local`·가상 환경·ZIP은 커밋하지 않습니다. `vendor/aga-eye`는 모델 팀의 고정된 MIT 소스이며 `LICENSE`와 `SOURCE.json`을 보존합니다. 브라우저 테스트의 JPEG는 직접 만든 테스트 그림입니다.

## 재검증

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

Node.js와 Python의 설치는 각 실행 안내를 따릅니다. 실제 모델 시험에는 팀이 별도 제공한 ONNX가 필요합니다. Supabase 실계정/RLS, Docker 이미지 빌드, Render 배포, 실제 라즈베리파이 연결은 PR 자동 검증과 별도로 확인합니다.
