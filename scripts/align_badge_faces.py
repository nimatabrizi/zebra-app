#!/usr/bin/env python3
"""Yaka kartı için şeffaf portreleri MediaPipe ile hizalar ve ölçekler.

Tüm yüzler aynı piksel genişliğine çekilir; göz ortası (veya burun ucu)
sabit tuval koordinatına oturtulur. Taşan / boş kalan alanlar şeffaf kalır;
hiçbir boşluk doldurulmaz.

Kurulum:
  python3 -m pip install -r scripts/requirements-face-align.txt

Örnek:
  python3 scripts/align_badge_faces.py \\
    --input ./consultant-photos \\
    --output ./consultant-photos-aligned

Varsayılan tuval, uygulamadaki yaka kartı ile aynıdır (2048×3200).
"""

from __future__ import annotations

import argparse
import math
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal, Sequence

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR / ".models"
MODEL_PATH = MODEL_DIR / "face_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

IMAGE_EXTS = {".png", ".webp", ".jpg", ".jpeg", ".tif", ".tiff"}

# MediaPipe Face Mesh indeksleri
LM_LEFT_EYE_OUTER = 33
LM_LEFT_EYE_INNER = 133
LM_RIGHT_EYE_OUTER = 263
LM_RIGHT_EYE_INNER = 362
LM_NOSE_TIP = 1
LM_LEFT_CHEEK = 234
LM_RIGHT_CHEEK = 454

Anchor = Literal["eyes", "nose"]
WidthMode = Literal["bbox", "cheeks", "eyes"]


@dataclass(frozen=True)
class AlignConfig:
    canvas_width: int = 2048
    canvas_height: int = 3200
    target_x: float = 1024
    target_y: float = 1020
    face_width: float = 420
    anchor: Anchor = "eyes"
    width_mode: WidthMode = "bbox"


@dataclass(frozen=True)
class Point:
    x: float
    y: float


@dataclass(frozen=True)
class FacePose:
    bbox: tuple[float, float, float, float]
    left_eye: Point
    right_eye: Point
    nose: Point
    cheeks: tuple[Point, Point]

    @property
    def eye_mid(self) -> Point:
        return Point(
            (self.left_eye.x + self.right_eye.x) / 2,
            (self.left_eye.y + self.right_eye.y) / 2,
        )

    def anchor_point(self, mode: Anchor) -> Point:
        return self.nose if mode == "nose" else self.eye_mid

    def face_width(self, mode: WidthMode) -> float:
        if mode == "cheeks":
            return _dist(self.cheeks[0], self.cheeks[1])
        if mode == "eyes":
            return _dist(self.left_eye, self.right_eye)
        x, _y, w, _h = self.bbox
        return w


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _lm_to_point(landmark, width: int, height: int) -> Point:
    return Point(landmark.x * width, landmark.y * height)


def ensure_model(path: Path = MODEL_PATH) -> Path:
    if path.exists() and path.stat().st_size > 1000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"MediaPipe modeli indiriliyor:\n  {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, path)
    return path


def create_landmarker(model_path: Path):
    import mediapipe as mp

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.45,
        min_face_presence_confidence=0.45,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def detect_face(landmarker, rgb: np.ndarray) -> FacePose | None:
    import mediapipe as mp

    if rgb.dtype != np.uint8:
        rgb = rgb.astype(np.uint8)
    if not rgb.flags["C_CONTIGUOUS"]:
        rgb = np.ascontiguousarray(rgb)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = landmarker.detect(mp_image)
    if not result.face_landmarks:
        return None

    height, width = rgb.shape[:2]
    lms = result.face_landmarks[0]
    pts = [_lm_to_point(lm, width, height) for lm in lms]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    def idx(i: int) -> Point:
        if i < len(pts):
            return pts[i]
        return Point((min_x + max_x) / 2, (min_y + max_y) / 2)

    return FacePose(
        bbox=(min_x, min_y, max_x - min_x, max_y - min_y),
        left_eye=Point(
            (idx(LM_LEFT_EYE_OUTER).x + idx(LM_LEFT_EYE_INNER).x) / 2,
            (idx(LM_LEFT_EYE_OUTER).y + idx(LM_LEFT_EYE_INNER).y) / 2,
        ),
        right_eye=Point(
            (idx(LM_RIGHT_EYE_OUTER).x + idx(LM_RIGHT_EYE_INNER).x) / 2,
            (idx(LM_RIGHT_EYE_OUTER).y + idx(LM_RIGHT_EYE_INNER).y) / 2,
        ),
        nose=idx(LM_NOSE_TIP),
        cheeks=(idx(LM_LEFT_CHEEK), idx(LM_RIGHT_CHEEK)),
    )


def read_bgra(path: Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"okunamadı: {path}")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        alpha = np.full(img.shape[:2], 255, dtype=np.uint8)
        img = np.dstack([img, alpha])
    elif img.shape[2] == 4:
        pass
    else:
        raise ValueError(f"beklenmeyen kanal sayısı ({img.shape[2]}): {path}")
    return img


def write_png(path: Path, bgra: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buf = cv2.imencode(".png", bgra)
    if not ok:
        raise ValueError(f"PNG kodlanamadı: {path}")
    buf.tofile(str(path))


def alignment_matrix(pose: FacePose, config: AlignConfig) -> np.ndarray:
    width = pose.face_width(config.width_mode)
    if width < 8:
        raise ValueError("yüz genişliği çok küçük")
    scale = config.face_width / width
    anchor = pose.anchor_point(config.anchor)
    tx = config.target_x - anchor.x * scale
    ty = config.target_y - anchor.y * scale
    return np.array([[scale, 0.0, tx], [0.0, scale, ty]], dtype=np.float32)


def warp_transparent(bgra: np.ndarray, matrix: np.ndarray, config: AlignConfig) -> np.ndarray:
    size = (config.canvas_width, config.canvas_height)
    bgr = bgra[:, :, :3]
    alpha = bgra[:, :, 3]
    warped_bgr = cv2.warpAffine(
        bgr,
        matrix,
        size,
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )
    warped_a = cv2.warpAffine(
        alpha,
        matrix,
        size,
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    return np.dstack([warped_bgr, warped_a])


def draw_debug(bgra: np.ndarray, pose: FacePose | None, config: AlignConfig) -> np.ndarray:
    vis = bgra.copy()
    bgr = vis[:, :, :3]
    cx, cy = int(round(config.target_x)), int(round(config.target_y))
    half = int(round(config.face_width / 2))
    cv2.line(bgr, (cx, 0), (cx, vis.shape[0]), (255, 255, 0), 2)
    cv2.line(bgr, (cx - half, cy), (cx + half, cy), (255, 255, 0), 2)
    cv2.rectangle(
        bgr,
        (cx - half, cy - int(half * 1.25)),
        (cx + half, cy + int(half * 1.25)),
        (255, 255, 0),
        2,
    )
    if pose is not None:
        x, y, w, h = pose.bbox
        cv2.rectangle(bgr, (int(x), int(y)), (int(x + w), int(y + h)), (0, 220, 255), 2)
        for point, color in (
            (pose.left_eye, (80, 180, 255)),
            (pose.right_eye, (80, 180, 255)),
            (pose.nose, (80, 80, 255)),
            (pose.eye_mid, (0, 255, 0)),
        ):
            cv2.circle(bgr, (int(point.x), int(point.y)), 6, color, -1)
    vis[:, :, :3] = bgr
    vis[:, :, 3] = np.maximum(vis[:, :, 3], 180)
    return vis


def iter_images(folder: Path, recursive: bool) -> Iterable[Path]:
    pattern = "**/*" if recursive else "*"
    files = sorted(p for p in folder.glob(pattern) if p.is_file() and p.suffix.lower() in IMAGE_EXTS)
    return files


def align_image(
    path: Path,
    landmarker,
    config: AlignConfig,
) -> tuple[np.ndarray, FacePose, float]:
    bgra = read_bgra(path)
    rgb = cv2.cvtColor(bgra[:, :, :3], cv2.COLOR_BGR2RGB)
    pose = detect_face(landmarker, rgb)
    if pose is None:
        raise RuntimeError("yüz bulunamadı")
    matrix = alignment_matrix(pose, config)
    aligned = warp_transparent(bgra, matrix, config)
    scale = float(matrix[0, 0])
    return aligned, pose, scale


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Şeffaf portreleri yaka kartı tuvaline MediaPipe ile hizala."
    )
    parser.add_argument("--input", "-i", type=Path, required=True, help="Kaynak klasör")
    parser.add_argument("--output", "-o", type=Path, required=True, help="Çıktı klasörü")
    parser.add_argument("--recursive", action="store_true", help="Alt klasörleri de tara")
    parser.add_argument("--canvas-width", type=int, default=2048)
    parser.add_argument("--canvas-height", type=int, default=3200)
    parser.add_argument(
        "--face-width",
        type=float,
        default=420,
        help="Hedef yüz genişliği (px). bbox / yanak / göz mesafesine göre ölçeklenir.",
    )
    parser.add_argument("--target-x", type=float, default=1024, help="Yüz merkezinin X hedefi")
    parser.add_argument("--target-y", type=float, default=1020, help="Göz ortası / burun Y hedefi")
    parser.add_argument("--anchor", choices=("eyes", "nose"), default="eyes")
    parser.add_argument(
        "--width-mode",
        choices=("bbox", "cheeks", "eyes"),
        default="bbox",
        help="Ölçek için yüz genişliği ölçüsü",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Hizalama sonrası kılavuzlu kopyayı *_debug.png olarak kaydet",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    source = args.input.expanduser().resolve()
    dest = args.output.expanduser().resolve()
    if not source.is_dir():
        print(f"Kaynak klasör yok: {source}", file=sys.stderr)
        return 1

    config = AlignConfig(
        canvas_width=args.canvas_width,
        canvas_height=args.canvas_height,
        target_x=args.target_x,
        target_y=args.target_y,
        face_width=args.face_width,
        anchor=args.anchor,
        width_mode=args.width_mode,
    )

    model_path = ensure_model()
    landmarker = create_landmarker(model_path)
    files = list(iter_images(source, args.recursive))
    if not files:
        print(f"Görsel bulunamadı: {source}")
        return 1

    ok = 0
    failed: list[str] = []
    print(f"{len(files)} dosya işlenecek → {dest}")

    try:
        for path in files:
            relative = path.relative_to(source)
            out_path = dest / relative.with_suffix(".png")
            try:
                aligned, pose, scale = align_image(path, landmarker, config)
                write_png(out_path, aligned)
                if args.debug:
                    debug_pose = FacePose(
                        bbox=(
                            config.target_x - config.face_width / 2,
                            config.target_y - config.face_width * 0.65,
                            config.face_width,
                            config.face_width * 1.3,
                        ),
                        left_eye=Point(config.target_x - 70, config.target_y),
                        right_eye=Point(config.target_x + 70, config.target_y),
                        nose=Point(config.target_x, config.target_y + 40),
                        cheeks=(
                            Point(config.target_x - config.face_width / 2, config.target_y),
                            Point(config.target_x + config.face_width / 2, config.target_y),
                        ),
                    )
                    debug = draw_debug(aligned, debug_pose, config)
                    write_png(out_path.with_name(out_path.stem + "_debug.png"), debug)
                ok += 1
                print(
                    f"OK  {relative}  scale={scale:.3f}  "
                    f"bbox={pose.bbox[2]:.0f}x{pose.bbox[3]:.0f}"
                )
            except Exception as error:  # noqa: BLE001 — batch raporu
                failed.append(f"{relative}: {error}")
                print(f"ERR {relative}: {error}")
    finally:
        landmarker.close()

    print(f"\nBitti: {ok} başarılı, {len(failed)} hatalı")
    if failed:
        print("Hatalar:")
        for line in failed:
            print(f"  - {line}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
