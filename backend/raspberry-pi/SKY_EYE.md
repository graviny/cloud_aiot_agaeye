# 아가아이 Raspberry Pi 연결

이 폴더는 카메라와 안전 관측을 전송하는 Python 3.9+ 클라이언트입니다.
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
