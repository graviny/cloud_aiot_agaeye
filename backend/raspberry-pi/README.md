# 아가아이 Raspberry Pi 연결

이 폴더는 안전 관측, 알림 사진, 설정한 주기의 캡처를 전송하는 Python 3.9+ 클라이언트입니다.
같은 저장소의 [Sky Eye 설치 안내](../../edge/sky-eye/README.md)에서 카메라 분석 코드와 모델 준비 방법을 확인하세요. Sky Eye 카메라 모델과 `sky-eye`, `sky-eye-export` 사용자 서비스가 설치된 파이에서 사용합니다.
기존 모델 출력에 울음 필드가 있어도 전송하지 않으며 울음 이벤트는 건너뜁니다. 오디오 서비스는 시작하지 않습니다.
기존에 별도로 실행 중인 오디오 모델을 이 프로그램이 중지하거나 변경하지는 않습니다.

```bash
python3 -m pip install -r requirements.txt
bash start-agaeye.sh --api-url http://PC_IP:8081 --sky-eye-dir /home/pi/sky-eye --install-service
```

PC 서버는 `scripts/start-local.ps1 -Lan`으로 실행합니다. PC와 파이는 서로 접근 가능한 네트워크를 사용합니다.
파이에 표시되는 연결 코드를 PC의 http://localhost:5177 에서 로그인 후 `아가아이 연결하기`에 입력합니다.
PC_IP와 모델 경로는 실제 환경에 맞게 바꿉니다. 파이에서 localhost는 PC 주소가 아닙니다.
기기 키와 설정은 아가아이 전용 디렉터리(`~/.local/share/agaeye`, `~/.config/agaeye`)에 생성합니다.
기존 아이쿠 계정 연결이나 인증키는 자동 이전하지 않습니다.

```bash
systemctl --user status agaeye-sky-eye --no-pager
bash start-agaeye.sh --unlink
```

계정/아이 재할당 시 기존 관측 파일은 `--fresh-profile`로 백업한 뒤 시작합니다.
백업·자동 시작은 실제 파이의 systemd 사용자 세션에서 동작합니다.

알림 사진은 서버가 신규 알림을 등록했을 때 파이의 로컬 Sky Eye 카메라에서 캡처합니다.
카메라에서 알림 시각과 5초 이내의 사진을 얻으면 해당 알림에 JPEG 한 장을 저장합니다.
서버 재연결 후 뒤늦게 전달된 과거 관측에 현재 사진을 붙이지 않습니다.
사진 없이 관측 결과만 보내려면 실행 명령에 `--no-camera`를 추가합니다.
기존 대기 서비스를 업데이트한 뒤에는 `systemctl --user restart agaeye-sky-eye`로 새 전송 코드를 적용합니다.

## 주기 캡처

Spring Boot API와 파이의 Sky Eye 런타임·전송기를 모두 이 브랜치의 코드로 업데이트합니다. 백엔드 시작 시 Flyway가 `V10` 마이그레이션을 적용합니다. 파이에서 이미 실행 중인 Sky Eye가 있다면 설치 경로를 확인하고 업데이트된 코드로 해당 카메라 서비스(`sky-eye` 또는 `sky-eye-objects`)를 재시작합니다.

파이의 `backend/raspberry-pi` 폴더에서 아래 명령을 실행합니다. 예시 주소와 Sky Eye 경로를 팀 환경에 맞게 바꿉니다.

```bash
bash start-agaeye.sh --api-url https://YOUR_API_HOST \
  --sky-eye-dir /home/pi/sky-eye --capture-interval 15 --install-service
journalctl --user -u agaeye-sky-eye -f
```

캡처 간격은 설정 파일에 저장됩니다. `--capture-interval 0`으로 주기 캡처를 끌 수 있으며, 새 설치의 기본값은 `0`입니다. 단건 전송을 확인하려면 대기 서비스가 실행 중이지 않은 상태에서 `--install-service` 자리에 `--once`를 사용합니다. 카메라가 이미 준비되어 있으면 `Sky Eye capture and analysis uploaded.`가 출력됩니다. 단건 실행에 지정한 간격도 설정 파일에 저장됩니다.

전송기는 로컬 `/frame.jpg`에서 동일 프레임의 JPEG, 촬영 시각, 판정 상태, 자세, 기도 가림 분석을 받아 `POST /api/v1/device/sky-eye/capture`로 전송합니다. 판정할 수 없는 프레임은 상태가 `unavailable`이며 자세와 기도 분석 필드를 생략합니다. 프레임이 오래됐거나 업로드가 실패하면 해당 회차는 건너뜁니다. 서버는 기기별 최신 한 장을 보관하고 기기 연결을 해제하면 삭제합니다.

보호자는 `GET /api/v1/children/{childId}/devices/{deviceId}/capture`를 조회할 수 있습니다. 사용자 Bearer 토큰과 `X-Workspace-Id`가 필요합니다. 캡처가 있으면 `200`과 JPEG 본문, `X-Frame-Captured-At`, `X-Frame-State`, 값이 있는 경우 `X-Frame-Posture`, `X-Frame-Airway` 헤더를 반환합니다. 아직 받은 캡처가 없으면 `204`를 반환합니다. 상태는 헤더에 표시된 촬영 시점의 모델 결과입니다.
