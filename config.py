import os
import sys
import json
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, Optional

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(APP_DIR, "config.json")

VALID_POSITIONS = ("All", "VestFront", "VestBack")
VALID_SINK_KINDS = ("bhaptics", "websocket")


def clamp_int(val: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, int(val)))
    except (ValueError, TypeError):
        return default


def clamp_float(val: Any, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(val)))
    except (ValueError, TypeError):
        return default


def normalize_motor_count(val: Any, default: int = 32) -> int:
    try:
        return 40 if int(val) == 40 else 32
    except (ValueError, TypeError):
        return default


def normalize_position(val: Any, default: str = "All") -> str:
    s = str(val).strip() if val is not None else default
    return s if s in VALID_POSITIONS else default


def normalize_sink_kind(val: Any, default: str = "bhaptics") -> str:
    s = str(val).strip().lower() if val is not None else default
    return s if s in VALID_SINK_KINDS else default


def parse_detail_row(raw: Any, defaults: Optional['HapticDetailRow'] = None) -> 'HapticDetailRow':
    """Parse only allowed HapticDetailRow fields with range clamping."""
    base = defaults or HapticDetailRow()
    if not isinstance(raw, dict):
        return HapticDetailRow(base.intensity, base.duration, base.hit_count, base.position)
    return HapticDetailRow(
        intensity=clamp_int(raw.get("intensity", base.intensity), 0, 100, base.intensity),
        duration=round(clamp_float(raw.get("duration", base.duration), 0.05, 5.0, base.duration), 3),
        hit_count=clamp_int(raw.get("hit_count", base.hit_count), 1, 5, base.hit_count),
        position=normalize_position(raw.get("position", base.position), base.position),
    )


@dataclass
class SinkConfig:
    kind: str = "bhaptics"          # "bhaptics" (공식 SDK 기본) | "websocket" (레거시 옵션)
    app_id: str = ""                # bHaptics Developer Portal App ID
    api_key: str = ""               # bHaptics Developer Portal API Key
    motor_count: int = 32           # 기본 32 (TactSuit Pro), 40 (TactSuit X40)
    front_gain: float = 1.0         # 전면 모터 게인 (0.0 ~ 3.0)
    back_gain: float = 1.0          # 후면 모터 게인 (0.0 ~ 3.0)
    ws_url: str = "ws://127.0.0.1:15888/v2/feedbacks" # 레거시 웹소켓 주소
    master_intensity: int = 100     # 마스터 세기 (0 ~ 100%)

# 하위 호환성을 위한 별칭
HapticConfig = SinkConfig

@dataclass
class HapticDetailRow:
    intensity: int = 100            # 세기 (0 ~ 100 %)
    duration: float = 0.30          # 지속시간 (초 단위)
    hit_count: int = 1              # 타격 횟수 (1 ~ 5회 버스트)
    position: str = "All"           # 부위 ("All", "VestFront", "VestBack")

@dataclass
class DetailedHapticConfig:
    # 1. 경타 (1~20% 피격)
    light: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=80, duration=0.26, hit_count=1, position="All"))
    # 2. 중타 (21~50% 피격)
    medium: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=95, duration=0.38, hit_count=2, position="All"))
    # 3. 강타 (51~80% 피격)
    heavy: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=100, duration=0.48, hit_count=3, position="All"))
    # 4. 치명타 (81~100% 피격)
    critical: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=100, duration=0.55, hit_count=4, position="All"))
    # 5. 기절 (HP 0 사망/기절)
    faint: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=100, duration=0.85, hit_count=2, position="All"))
    # 6. 빨피 심장박동 (HP 20% 이하)
    heartbeat: HapticDetailRow = field(default_factory=lambda: HapticDetailRow(intensity=70, duration=0.15, hit_count=1, position="VestFront"))
    # 앞뒤 밸런스
    front_balance: int = 100
    back_balance: int = 100

@dataclass
class AppConfig:
    sink: SinkConfig = field(default_factory=SinkConfig)
    details: DetailedHapticConfig = field(default_factory=DetailedHapticConfig)
    enable_heartbeat: bool = True   # 빨피 시 심장박동 햅틱 사용 여부

    @property
    def haptic(self) -> SinkConfig:
        """기존 코드 호환용 프로퍼티"""
        return self.sink

    def save(self, filepath: str = CONFIG_FILE) -> None:
        """설정을 JSON 파일로 저장"""
        try:
            data = {
                "sink": {
                    "kind": self.sink.kind,
                    "app_id": self.sink.app_id,
                    "api_key": self.sink.api_key,
                    "motor_count": self.sink.motor_count,
                    "front_gain": self.sink.front_gain,
                    "back_gain": self.sink.back_gain,
                    "ws_url": self.sink.ws_url,
                    "master_intensity": self.sink.master_intensity
                },
                "details": {
                    "front_balance": self.details.front_balance,
                    "back_balance": self.details.back_balance,
                    "light": asdict(self.details.light),
                    "medium": asdict(self.details.medium),
                    "heavy": asdict(self.details.heavy),
                    "critical": asdict(self.details.critical),
                    "faint": asdict(self.details.faint),
                    "heartbeat": asdict(self.details.heartbeat)
                },
                "enable_heartbeat": self.enable_heartbeat
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"[Config] 설정 저장 완료: {filepath}")
        except Exception as e:
            print(f"[Config] 설정 저장 실패: {e}")

    @classmethod
    def load(cls, filepath: str = CONFIG_FILE) -> 'AppConfig':
        """JSON 파일에서 설정 로드"""
        if not os.path.exists(filepath):
            cfg = cls()
            cfg.save(filepath)
            return cfg

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # "sink" 우선 로드, 이전 형식의 "haptic"도 호환 로드
            sink_data = data.get("sink") or data.get("haptic") or {}
            if not isinstance(sink_data, dict):
                sink_data = {}
            sink = SinkConfig(
                kind=normalize_sink_kind(sink_data.get("kind", "bhaptics")),
                app_id=str(sink_data.get("app_id", "") or "").strip(),
                api_key=str(sink_data.get("api_key", "") or "").strip(),
                motor_count=normalize_motor_count(sink_data.get("motor_count", 32)),
                front_gain=clamp_float(sink_data.get("front_gain", 1.0), 0.0, 3.0, 1.0),
                back_gain=clamp_float(sink_data.get("back_gain", 1.0), 0.0, 3.0, 1.0),
                ws_url=str(sink_data.get("ws_url", "ws://127.0.0.1:15888/v2/feedbacks") or "ws://127.0.0.1:15888/v2/feedbacks").strip(),
                master_intensity=clamp_int(sink_data.get("master_intensity", 100), 0, 100, 100)
            )

            # Details (허용 필드만 안전 추출 및 범위 클램핑)
            details_defaults = DetailedHapticConfig()
            details_data = data.get("details", {})
            if not isinstance(details_data, dict):
                details_data = {}
            details_kwargs = {}
            for k in ["light", "medium", "heavy", "critical", "faint", "heartbeat"]:
                if k in details_data and isinstance(details_data[k], dict):
                    details_kwargs[k] = parse_detail_row(details_data[k], getattr(details_defaults, k))

            for k in ["front_balance", "back_balance"]:
                if k in details_data:
                    details_kwargs[k] = clamp_int(details_data[k], 0, 100, getattr(details_defaults, k))

            details = DetailedHapticConfig(**details_kwargs)
            return cls(
                sink=sink,
                details=details,
                enable_heartbeat=bool(data.get("enable_heartbeat", True))
            )
        except Exception as e:
            print(f"[Config] 설정 로드 오류({e}), 기본값 사용")
            return cls()