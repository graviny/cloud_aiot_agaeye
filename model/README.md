# 질식 위험 탐지 모델

침대 위 카메라 영상에서 **엎드림**과 **코·입 가림**을 찾아, 5초 이상 이어지면 위험으로 판정합니다.
학습은 GPU PC에서 하고, 실행은 라즈베리파이 4에서 ONNX Runtime으로 합니다.
아래 명령은 모두 `model/` 폴더에서 실행합니다.

```
agaeye/    판정·위험 시간·ONNX 추론·영상 입력·알림 전송 (파이에서도 사용, PyTorch 불필요)
scripts/   데이터 받기 → 정리 → 학습 → 평가 → ONNX 내보내기, 판정 기준 비교
edge/      실시간 실행(run_edge.py), 추론 속도 측정(benchmark.py)
configs/   데이터셋·학습·실험·엣지 설정
results/   실험 결과표
```

## 모델

YOLOv8n, 입력 320×320

| 클래스 | 박스 | 뜻 |
|---|---|---|
| `supine` / `side` / `prone` | 몸 | 바로 누움 / 옆으로 누움 / 엎드림 |
| `airway_visible` / `airway_covered` | 얼굴 | 코·입 보임 / 가림 |

판정 규칙 (`configs/edge.yaml`)
- 몸 박스(신뢰도 0.2 이상) 중 가장 높은 것으로 자세를, 그 안의 얼굴 박스(0.15 이상)로 코·입 상태를 정합니다.
- 엎드림 또는 코·입 가림이 5초 이어지면 위험, 정상이 3초 이어지면 종료합니다. 1초 이하로 놓친 프레임은 이어진 것으로 봅니다.
- 기준값은 `scripts/sweep_thresholds.py`로 84개 조합을 비교해 정했습니다.

## 모델 받기

가중치는 [릴리즈 model-v1](https://github.com/graviny/cloud_aiot_agaeye/releases/tag/model-v1)에 있습니다.

```bash
curl -L --create-dirs -o models/agaeye_A_original_320_aug.onnx \
  https://github.com/graviny/cloud_aiot_agaeye/releases/download/model-v1/agaeye_A_original_320_aug.onnx
sha256sum models/agaeye_A_original_320_aug.onnx
# e2546caef8500e8aaa80b0edec071d77f3b0975daccf560416dc64e8ddc73352
```

## 실시간 실행

노트북 (웹캠·영상 파일)

```bash
pip install -r requirements-edge.txt
python edge/run_edge.py --source 0 --show
python edge/run_edge.py --source video.mp4
```

라즈베리파이 4 (64비트 Raspberry Pi OS). numpy 충돌을 피하려고 카메라·OpenCV는 apt로 설치합니다.

```bash
sudo apt install -y python3-picamera2 python3-opencv python3-yaml python3-requests
python3 -m venv --system-site-packages .venv && source .venv/bin/activate
pip install onnxruntime
python edge/benchmark.py --model models/agaeye_A_original_320_aug.onnx
python edge/run_edge.py --source picamera2 --server http://<서버 주소>
```

- 초당 3회 판정합니다(`infer_fps`). 추론 평균이 300ms를 넘으면 2로 낮춥니다.
- `--server`가 없으면 결과를 콘솔에만 출력합니다.
- 카메라는 침대 위에서 수직으로 내려다보게 설치합니다. 학습 사진이 그 각도입니다.

## 학습 재현 (GPU PC)

PyTorch를 CUDA 버전에 맞춰 먼저 설치한 뒤 실행합니다.

```bash
pip install -r requirements.txt
ROBOFLOW_API_KEY=<키> python scripts/download_dataset.py
python scripts/prepare_dataset.py
python scripts/run_experiments.py
```

- 결과는 `results/summary.csv`, ONNX는 `models/agaeye_<실험이름>.onnx`에 저장됩니다.
- 학습 설정은 Pirotello 외(SBCUP 2026)를 따랐습니다: 200에폭, patience 50, Adam, 학습률 0.001 고정, 배치 16.
- 배포 모델(`A_original_320_aug`)은 좌우 반전·밝기 변형 증강을 켰습니다.

## 결과

테스트 273장, 사진 단위 판정

| 실험 | mAP50 | 위험 재현율 | 위험 정밀도 | 자세 정확도 |
|---|---|---|---|---|
| A_original_512 | 0.822 | 93.6% | 95.0% | 90.7% |
| A_original_416 | 0.806 | 90.8% | 99.2% | 91.4% |
| A_original_320 | 0.804 | 90.8% | 99.2% | 93.3% |
| A_original_416_aug | 0.816 | 93.6% | 97.1% | 93.7% |
| **A_original_320_aug (배포)** | **0.819** | **96.5%** | **96.5%** | **94.4%** |

- 원래 분할은 연속 촬영 사진이 학습·테스트에 섞여 있어 실제보다 높게 나옵니다.
- 인형 연속 촬영 사진(`IMG_`, 1,462장)을 통째로 테스트로 뺀 실험(B)에서는 위험 재현율이 33~35%입니다. 엎드림은 93~94% 잡지만, 엎드리지 않은 코·입 가림은 거의 못 잡습니다. 그런 사진이 대부분 이 출처에만 있기 때문이라 직접 촬영한 데이터로 보강이 필요합니다.

## 데이터셋·참고

- [Baby-Position v1](https://universe.roboflow.com/jennifer-verona-uzduw/baby-position-esrva) (CC BY 4.0), 학습 2,198 / 검증 274 / 테스트 273장
- G. L. Pirotello, A. T. Akabane, D. C. González, "A Lightweight Deep Learning Approach for Autonomous Detection of Risky Infant Sleep Postures," SBCUP 2026. https://sol.sbc.org.br/index.php/sbcup/article/view/43282
- 코드는 [MIT](LICENSE), 데이터셋은 원 저작자의 CC BY 4.0을 따릅니다.
