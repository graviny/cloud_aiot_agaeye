# 아가 아이 · Cloud AIoT

라즈베리파이가 분석한 아기 수면 상태와 위험 알림을 보호자가 확인하는 웹 프로젝트입니다. 이 브랜치는 카메라·모델 없이 실행하는 화면 데모를 제공합니다.

## 실행

Node.js 22.12 이상 또는 24 LTS에서 프로젝트 폴더로 이동합니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

웹 주소: http://127.0.0.1:5173/. Windows에서는 `start-local.cmd`로도 실행합니다. 기본 모드는 `mock`이며 실제 영유아 사진을 사용하지 않습니다.

## 기능

- 카메라·서버·아기 존재·위험 상태 표시
- 위험 발생 사진, 로딩 실패·재시도, 현재 알림과 지난 사진 구분
- 위험 이력 필터·상세·보호자 확인 기록
- 연결 끊김·오래된 분석을 현재 정상으로 표시하지 않음
- 모바일 화면과 17개 개발용 시나리오

확인 버튼은 보호자가 상황을 인지했다는 기록이며 위험 종료와 다릅니다. 화면의 예시 사진은 SVG입니다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

브라우저 검증은 Windows의 Microsoft Edge를 사용합니다. 다른 환경은 Playwright Chromium 설치가 필요합니다.

[팀 개발 안내](docs/TEAM_GUIDE.md) · [데이터 계약 초안](docs/API_CONTRACT.md)
