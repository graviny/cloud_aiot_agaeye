"""Generate a plain input video for plumbing checks; this is not infant test data."""
from pathlib import Path
import cv2
import numpy as np

path = Path(__file__).resolve().parents[1] / "runtime" / "check-input.avi"
path.parent.mkdir(exist_ok=True)
writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 12, (320, 240))
if not writer.isOpened():
    raise RuntimeError("Cannot create check video")
for index in range(144):
    frame = np.full((240, 320, 3), 127, dtype=np.uint8)
    cv2.putText(frame, "CPU input test", (35, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 240, 240), 1)
    writer.write(frame)
writer.release()
print(path)
