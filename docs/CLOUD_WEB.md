# 보호자 클라우드 웹

`VITE_DATA_MODE=cloud`일 때 로그인 화면을 표시하고 Supabase에 등록한 이메일·비밀번호로 로그인합니다.

`.env.cloud.example`을 `.env.local`로 복사하고 Supabase 공개 URL·publishable/anon 키, 클라우드 API URL, 기기 ID를 입력한 뒤 `npm.cmd run dev:cloud`로 실행합니다. API CORS에 `http://127.0.0.1:5176`을 등록합니다.

SSE와 사진 요청은 Authorization 헤더를 사용합니다. URL에 토큰을 넣거나 Storage 공개 버킷을 만들지 않습니다. 사진은 인증 후 Blob URL로 표시하고 로그아웃 시 해제합니다. 새로고침과 자동 토큰 갱신을 지원합니다.

검증: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:cloud`. 클라우드 브라우저 테스트는 테스트 로그인 응답과 실제 FastAPI 앱의 저장소 대역을 사용합니다. 실제 계정이나 영유아 사진은 사용하지 않습니다.
