# Sky Eye 카메라 분석

팀이 파이에 설치한 `sky-eye-integrated-20261101` 배포본에서 아가아이에 쓰는 카메라 추론과 자세·침대 경계 판정 코드를 가져왔습니다. 원본 라이선스는 [LICENSE](LICENSE)에 있습니다.

카메라 프레임 → `sky_edge.runtime` 자세·위험 판정 → `sky_edge.export` 상태·이벤트 파일 → [아가아이 전송기](../../backend/raspberry-pi/README.md) → 백엔드 순서로 동작합니다. 전송기는 알림 사진과 선택적으로 설정한 주기 캡처에 파이 내부의 `/frame.jpg`를 사용합니다. 해당 응답에는 JPEG와 같은 프레임의 촬영 시각과 자세 판정이 함께 포함됩니다.

## 파이에서 설치하고 연결하기

새 설치 기준입니다. 이미 운영 중인 파이에서는 기존 서비스의 설치 경로를 먼저 확인하세요. 다음 명령은 저장소 루트에서 시작합니다.

```bash
cd edge/sky-eye
python3 models/import_weights.py ~/Downloads/personal-deployment.zip
bash deploy/pi/install.sh usb
bash deploy/pi/edge.sh check
bash deploy/pi/install-services.sh
```

팀이 사용한 Pi 4의 32비트 프로필은 Bullseye ARMv7, Python 3.9, USB 카메라, NCNN 조합입니다. 64비트 Raspberry Pi OS에서는 ONNX Runtime을 사용하며, CSI 카메라라면 설치 명령의 `usb`를 `csi`로 바꿉니다. [모델 파일과 버전](models/README.md)

카메라 방향을 고정한 뒤 `bash deploy/pi/edge.sh snapshot --output snapshot.jpg`로 구도를 확인합니다. 침대 경계 판정을 쓰려면 `python3 deploy/pi/calibrate.py --help`를 참고해 실제 사진에서 측정한 꼭짓점과 난간·열린 면을 입력합니다. 기본 지오메트리는 미보정 상태입니다.

PC에서 백엔드를 LAN 모드로 실행한 후 파이에서 아래 명령을 실행합니다. `PC_IP`는 해당 PC의 LAN 주소로 바꿉니다.

```bash
camera_dir="$PWD"
cd ../../backend/raspberry-pi
python3 -m pip install -r requirements.txt
bash start-agaeye.sh --sky-eye-dir "$camera_dir" --api-url http://PC_IP:8081 --install-service
```

파이에 처음 표시되는 연결 코드는 웹의 **아가아이 연결하기**에서 승인합니다. `systemctl --user status sky-eye sky-eye-export agaeye-sky-eye --no-pager`로 실행 상태를 확인합니다.

## 카메라 없이 협업하기

저장소 루트에서 `python3 examples/sky-eye/replay.py`를 실행하면 합성 엎드림 이벤트를 실제 내보내기 코드로 변환합니다. 결과는 표준 출력에 표시되고 작업 파일은 임시 폴더에 생성됩니다. [샘플 입력](../../examples/sky-eye/logs/20261101-120000/events.jsonl)

백엔드까지 실행 중이면 `backend/raspberry-pi/smoke_camera_local.py`로 알림별 JPEG 저장·조회를 시험할 수 있습니다. 이 검사는 테스트용 계정과 기록을 생성하므로 로컬 테스트 DB를 사용하세요.
