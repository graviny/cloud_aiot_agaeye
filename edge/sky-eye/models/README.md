# 카메라 모델 설치

팀 공유 파일 `personal-deployment.zip`의 `sky-eye-integrated-20261101.tar.gz`가 원본입니다. 배포본이 없는 팀원은 파이 담당자에게 해당 ZIP을 받으세요. Git의 `model_meta.json`과 `ncnn_meta.json`에는 파일별 SHA-256과 클래스 순서가 있습니다.

`edge/sky-eye`에서 다음 명령을 실행합니다. ZIP 경로는 받은 파일 위치로 바꿉니다.

```bash
python3 models/import_weights.py ~/Downloads/personal-deployment.zip
```

`Verified and installed 3 camera weight files`가 표시되면 설치가 끝납니다. `models/infant/`에는 5개 클래스(바로 누움, 옆으로 누움, 엎드림, 기도 보임, 기도 가림)를 사용하는 다음 파일이 생깁니다.

| 파일 | 용도 |
| --- | --- |
| `model.onnx` | 320×320 입력 ONNX 추론 및 원본 대조 |
| `model.ncnn.param`, `model.ncnn.bin` | Raspberry Pi OS 32비트 NCNN 추론 |

ONNX 가중치의 SHA-256은 `e2546caef8500e8aaa80b0edec071d77f3b0975daccf560416dc64e8ddc73352`입니다. 설치기는 세 파일 모두를 검증한 뒤 배치합니다.
