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
            sink = SinkConfig(
                kind=str(sink_data.get("kind", "bhaptics")),
                app_id=str(sink_data.get("app_id", "")),
                api_key=str(sink_data.get("api_key", "")),
                motor_count=int(sink_data.get("motor_count", 32)),
                front_gain=float(sink_data.get("front_gain", 1.0)),
                back_gain=float(sink_data.get("back_gain", 1.0)),
                ws_url=str(sink_data.get("ws_url", "ws://127.0.0.1:15888/v2/feedbacks")),
                master_intensity=int(sink_data.get("master_intensity", 100))
            )

            # Details
            details_data = data.get("details", {})
            details_kwargs = {}
            for k in ["light", "medium", "heavy", "critical", "faint", "heartbeat"]:
                if k in details_data and isinstance(details_data[k], dict):
                    details_kwargs[k] = HapticDetailRow(**details_data[k])

            for k in ["front_balance", "back_balance"]:
                if k in details_data:
                    details_kwargs[k] = int(details_data[k])

            details = DetailedHapticConfig(**details_kwargs)
            return cls(
                sink=sink,
                details=details,
                enable_heartbeat=bool(data.get("enable_heartbeat", True))
            )
        except Exception as e:
            print(f"[Config] 설정 로드 오류({e}), 기본값 사용")
            return cls()