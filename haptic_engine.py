import sys
import time
import math
import json
import asyncio
import threading
from typing import Optional, List, Dict, Any, Tuple
import numpy as np

from config import SinkConfig, HapticConfig, DetailedHapticConfig, HapticDetailRow, AppConfig

try:
    import bhaptics_python
    HAS_BHAPTICS_SDK = True
except ImportError:
    bhaptics_python = None
    HAS_BHAPTICS_SDK = False

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    websockets = None
    HAS_WEBSOCKETS = False

def resample_4x5_to_4x4(motors_20: List[int]) -> List[int]:
    """
    4열 x 5행 (20개) 모터를 4열 x 4행 (16개) 모터로 리샘플링.
    열(4개)은 그대로 유지하고 5행을 4행으로 선형 보간하여 충격감을 보존합니다.
    """
    grid = np.array(motors_20, dtype=np.float32).reshape((5, 4))
    res = np.zeros((4, 4), dtype=np.int32)
    for r in range(4):
        y = r * 4.0 / 3.0
        y0 = int(math.floor(y))
        y1 = min(4, int(math.ceil(y)))
        frac = y - y0
        if y0 == y1:
            val = grid[y0, :]
        else:
            interp = (1.0 - frac) * grid[y0, :] + frac * grid[y1, :]
            max_val = np.maximum(grid[y0, :], grid[y1, :]) * 0.9
            val = np.maximum(interp, max_val)
        res[r, :] = np.clip(np.round(val), 0, 100)
    return res.flatten().tolist()

class HapticEngine:
    """
    치지직 포켓몬 배틀 전용 bHaptics 햅틱 컨트롤러
    - 기본: 공식 bhaptics-python SDK (registry_and_initialize & play_dot)
    - 레거시: 로컬 WebSocket (ws://127.0.0.1:15888/v2/feedbacks)
    - 32모터 (4x5 -> 4x4 리샘플링, TactSuit Pro 기본) & 40모터 (TactSuit X40)
    - 전면/후면 게인 및 0~100 clamp 단일 1D 배열 출력
    - 4단계 데미지 비례 충격(경타/중타/강타/치명타) + 기절 + 빨피 심장박동
    """

    def __init__(self, config: AppConfig):
        self.config = config
        self.sink_cfg = config.sink
        self.haptic_cfg = config.sink
        self.details_cfg = config.details

        self._connected = False
        self._status_msg = "연결 대기 중"
        self._is_running = False

        # Asyncio 이벤트 루프 및 전용 백그라운드 스레드
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._ws = None  # 레거시 웹소켓 연결 객체

        # 실시간 모터 상태 추적 (UI 시각화용)
        self.last_front_motors: List[int] = [0] * 20
        self.last_back_motors: List[int] = [0] * 20
        self.last_trigger_time: float = 0.0
        self.last_duration_ms: int = 0
        self.last_level: str = "none"
        self.last_damage_percent: float = 0.0
        self._state_lock = threading.Lock()

        # 백그라운드 이벤트 루프 스레드 시작
        self._start_event_loop_thread()

    def _start_event_loop_thread(self):
        """bHaptics 비동기 SDK/WebSocket 전용 이벤트 루프 스레드 구동"""
        self._is_running = True
        ready_event = threading.Event()

        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            ready_event.set()
            print("[Haptics] 공식 SDK 비동기 이벤트 루프 시작됨")
            self._loop.run_forever()

        self._thread = threading.Thread(target=run_loop, daemon=True, name="bHapticsAsyncWorker")
        self._thread.start()
        ready_event.wait(timeout=3.0)

    def is_connected(self) -> bool:
        return self._connected

    def get_player_status(self) -> Dict[str, Any]:
        """bHaptics Player 설치 및 구동 여부 확인"""
        if not HAS_BHAPTICS_SDK or not self._loop or not self._loop.is_running():
            return {"has_sdk": HAS_BHAPTICS_SDK, "installed": False, "running": False}

        async def _check():
            try:
                inst = await bhaptics_python.is_bhaptics_player_installed()
                run = await bhaptics_python.is_bhaptics_player_running()
                return {"has_sdk": True, "installed": bool(inst), "running": bool(run)}
            except Exception as e:
                return {"has_sdk": True, "installed": False, "running": False, "error": str(e)}

        future = asyncio.run_coroutine_threadsafe(_check(), self._loop)
        try:
            return future.result(timeout=2.0)
        except Exception:
            return {"has_sdk": True, "installed": False, "running": False}

    def launch_player(self) -> bool:
        """bHaptics Player 실행 시도"""
        if not HAS_BHAPTICS_SDK or not self._loop or not self._loop.is_running():
            return False

        async def _launch():
            try:
                res = bhaptics_python.run_bhaptics_player(True)
                if asyncio.iscoroutine(res) or isinstance(res, asyncio.Future):
                    await res
                return True
            except Exception as e:
                print(f"[Haptics] bHaptics Player 실행 실패: {e}")
                return False

        future = asyncio.run_coroutine_threadsafe(_launch(), self._loop)
        try:
            return bool(future.result(timeout=3.0))
        except Exception:
            return False

    def get_status(self) -> Dict[str, Any]:
        with self._state_lock:
            p_status = self.get_player_status()
            return {
                "connected": self._connected,
                "status_msg": self._status_msg,
                "kind": self.sink_cfg.kind,
                "has_sdk": HAS_BHAPTICS_SDK,
                "player_installed": p_status.get("installed", False),
                "player_running": p_status.get("running", False),
                "motor_count": self.sink_cfg.motor_count,
                "front_gain": self.sink_cfg.front_gain,
                "back_gain": self.sink_cfg.back_gain,
                "master_intensity": self.sink_cfg.master_intensity,
                "last_level": self.last_level,
                "last_damage_percent": round(self.last_damage_percent, 1),
                "last_trigger_time": self.last_trigger_time,
                "app_id": self.sink_cfg.app_id[:4] + "****" if self.sink_cfg.app_id else "",
            }

    def connect(self, app_id: Optional[str] = None, api_key: Optional[str] = None, kind: Optional[str] = None, motor_count: Optional[int] = None, front_gain: Optional[float] = None, back_gain: Optional[float] = None) -> Tuple[bool, str]:
        """설정된 출력 방식(공식 SDK or 레거시 WebSocket)으로 연결 초기화"""
        if kind is not None:
            self.sink_cfg.kind = kind
        if app_id is not None:
            self.sink_cfg.app_id = app_id.strip()
        if api_key is not None:
            self.sink_cfg.api_key = api_key.strip()
        if motor_count is not None:
            self.sink_cfg.motor_count = int(motor_count)
        if front_gain is not None:
            self.sink_cfg.front_gain = float(front_gain)
        if back_gain is not None:
            self.sink_cfg.back_gain = float(back_gain)

        target_kind = self.sink_cfg.kind.lower()

        # 1. 공식 SDK 모드
        if target_kind == "bhaptics":
            if not HAS_BHAPTICS_SDK:
                self._connected = False
                self._status_msg = "bhaptics-python 패키지가 설치되지 않았습니다."
                return False, self._status_msg

            target_app_id = self.sink_cfg.app_id
            target_api_key = self.sink_cfg.api_key

            if not target_app_id or not target_api_key:
                self._connected = False
                self._status_msg = "App ID와 API Key가 비어 있습니다. bHaptics Developer Portal에서 발급받은 App ID와 API Key를 입력해주세요."
                print(f"[Haptics] {self._status_msg}")
                return False, self._status_msg

            async def _async_connect_sdk():
                try:
                    # Player 실행 여부 우선 확인
                    is_running = await bhaptics_python.is_bhaptics_player_running()
                    if not is_running:
                        self._connected = False
                        self._status_msg = "⚠️ PC에서 bHaptics Player가 실행되지 않았습니다. bHaptics Player를 먼저 실행해주세요."
                        print(f"[Haptics] {self._status_msg}")
                        return False, self._status_msg

                    print(f"[Haptics] bHaptics 공식 SDK 초기화 시도: App ID={target_app_id}")
                    init_res = await bhaptics_python.registry_and_initialize(target_app_id, target_api_key, "")
                    if not init_res:
                        self._connected = False
                        self._status_msg = "bHaptics SDK 초기화 실패: Player 연결 거부 또는 유효하지 않은 App ID/API Key입니다."
                        print(f"[Haptics] {self._status_msg}")
                        return False, self._status_msg

                    self._connected = True
                    self._status_msg = f"bHaptics 공식 SDK 연결 성공 (모터: {self.sink_cfg.motor_count}점)"
                    print(f"[Haptics] {self._status_msg}")
                    return True, self._status_msg
                except Exception as e:
                    self._connected = False
                    self._status_msg = f"bHaptics SDK 초기화 실패: {str(e)}"
                    print(f"[Haptics] {self._status_msg}")
                    return False, self._status_msg

            future = asyncio.run_coroutine_threadsafe(_async_connect_sdk(), self._loop)
            try:
                return future.result(timeout=6.0)
            except Exception as e:
                self._connected = False
                self._status_msg = f"연결 시간 초과 또는 실패: {e}"
                return False, self._status_msg

        # 2. 레거시 WebSocket 모드
        elif target_kind == "websocket":
            if not HAS_WEBSOCKETS:
                self._connected = False
                self._status_msg = "websockets 패키지가 설치되지 않았습니다."
                return False, self._status_msg

            ws_url = self.sink_cfg.ws_url or "ws://127.0.0.1:15888/v2/feedbacks"

            async def _async_connect_ws():
                try:
                    if self._ws:
                        await self._ws.close()
                    self._ws = await websockets.connect(ws_url, close_timeout=2)
                    self._connected = True
                    self._status_msg = f"레거시 WebSocket 연결 성공 ({ws_url})"
                    print(f"[Haptics] {self._status_msg}")
                    return True, self._status_msg
                except Exception as e:
                    # 15881 포트 시도
                    fallback_url = "ws://127.0.0.1:15881/v2/feedbacks"
                    try:
                        self._ws = await websockets.connect(fallback_url, close_timeout=2)
                        self._connected = True
                        self._status_msg = f"레거시 WebSocket 연결 성공 ({fallback_url})"
                        print(f"[Haptics] {self._status_msg}")
                        return True, self._status_msg
                    except Exception as e2:
                        self._connected = False
                        self._status_msg = f"레거시 WebSocket 연결 실패 ({ws_url}): {e}"
                        print(f"[Haptics] {self._status_msg}")
                        return False, self._status_msg

            future = asyncio.run_coroutine_threadsafe(_async_connect_ws(), self._loop)
            try:
                return future.result(timeout=5.0)
            except Exception as e:
                self._connected = False
                self._status_msg = f"WebSocket 연결 오류: {e}"
                return False, self._status_msg

        else:
            self._connected = False
            self._status_msg = f"알 수 없는 출력 방식입니다: {target_kind}"
            return False, self._status_msg

    def disconnect(self) -> None:
        """연결 종료 및 모든 진동 정지 (stop_all & close 호출)"""
        self._connected = False
        self._status_msg = "연결 종료됨"
        self.stop_all()

        async def _async_close():
            if HAS_BHAPTICS_SDK:
                try:
                    res = bhaptics_python.close()
                    if asyncio.iscoroutine(res) or isinstance(res, asyncio.Future):
                        await res
                except Exception:
                    pass
            if self._ws:
                try:
                    await self._ws.close()
                except Exception:
                    pass
                self._ws = None

        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(_async_close(), self._loop)

    def stop_all(self) -> None:
        """모든 햅틱 진동 정지"""
        with self._state_lock:
            self.last_front_motors = [0] * 20
            self.last_back_motors = [0] * 20
            self.last_trigger_time = 0.0

        async def _async_stop():
            if HAS_BHAPTICS_SDK:
                try:
                    res = bhaptics_python.stop_all()
                    if asyncio.iscoroutine(res) or isinstance(res, asyncio.Future):
                        await res
                except Exception:
                    pass
            if self._ws:
                try:
                    turn_off = {"Submit": [{"Type": "turnOff", "Key": "pokemon_hit"}]}
                    await self._ws.send(json.dumps(turn_off))
                except Exception:
                    pass

        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(_async_stop(), self._loop)

    def _create_sdk_motor_array(self, front_20: List[int], back_20: List[int]) -> Tuple[List[int], List[int], List[int]]:
        """
        내부 전면 20개 + 후면 20개 모터 프레임을 단일 배열로 변환:
        - motor_count == 32: 전면 4x5 -> 4x4 리샘플(16), 후면 4x5 -> 4x4 리샘플(16) 총 32개 단일 배열
        - motor_count == 40: 전면 20개 + 후면 20개 그대로 이어붙임 (40개 단일 배열)
        - 각 값은 0~100으로 clamp
        반환값: (sdk_motors, scaled_front_20, scaled_back_20)
        """
        m_factor = max(0.0, min(1.0, self.sink_cfg.master_intensity / 100.0))
        fb_factor = (self.details_cfg.front_balance / 100.0) * self.sink_cfg.front_gain
        bb_factor = (self.details_cfg.back_balance / 100.0) * self.sink_cfg.back_gain

        f20_g = [int(np.clip(v * fb_factor * m_factor, 0, 100)) for v in front_20]
        b20_g = [int(np.clip(v * bb_factor * m_factor, 0, 100)) for v in back_20]

        if self.sink_cfg.motor_count == 32:
            f16 = resample_4x5_to_4x4(f20_g)
            b16 = resample_4x5_to_4x4(b20_g)
            sdk_motors = [int(np.clip(v, 0, 100)) for v in (f16 + b16)]
        else:
            sdk_motors = [int(np.clip(v, 0, 100)) for v in (f20_g + b20_g)]

        return sdk_motors, f20_g, b20_g

    def _generate_motor_matrix(self, level: str, intensity: int, position_mode: str = "All") -> Tuple[List[int], List[int]]:
        """패턴 레벨에 따른 20개 모터 기본 강도 매핑"""
        front = [0] * 20
        back = [0] * 20

        use_front = position_mode in ["VestFront", "All"]
        use_back = position_mode in ["VestBack", "All"]

        if level == "light":
            # 경타: 가슴 중앙 4개 모터 집중
            indices = [5, 6, 9, 10]
            for idx in indices:
                if use_front: front[idx] = intensity
                if use_back: back[idx] = int(intensity * 0.4)

        elif level == "medium":
            # 중타: 가슴 + 명치 + 상복부 (10개 모터)
            indices = [4, 5, 6, 7, 8, 9, 10, 11, 13, 14]
            for idx in indices:
                if use_front: front[idx] = intensity
                if use_back: back[idx] = int(intensity * 0.6)

        elif level == "heavy":
            # 강타: 전면 전체 20개 모터 + 후면 상체 8개 모터
            for idx in range(20):
                if use_front: front[idx] = intensity
            back_indices = [4, 5, 6, 7, 8, 9, 10, 11]
            for idx in back_indices:
                if use_back: back[idx] = int(intensity * 0.8)

        elif level in ["critical", "faint"]:
            # 치명타 / 기절: 40개 전 모터 100% 최대 파워
            for idx in range(20):
                if use_front: front[idx] = intensity
                if use_back: back[idx] = intensity

        elif level == "heartbeat":
            # 심장박동: 좌측 가슴 집중 펄스
            indices = [4, 5, 8]
            for idx in indices:
                if use_front: front[idx] = intensity

        return front, back

    def trigger_pattern_burst(self, level: str, detail_row: HapticDetailRow, position_mode: Optional[str] = None, damage_pct: float = 0.0) -> None:
        """타격 횟수(Hit Count) 버스트 비동기 실행 및 출력 전송"""
        pos = position_mode if position_mode is not None else getattr(detail_row, "position", "All")
        hit_count = max(1, min(5, detail_row.hit_count))
        duration_ms = int(detail_row.duration * 1000)
        intensity_val = int(detail_row.intensity)

        async def _async_burst_worker():
            for burst_idx in range(hit_count):
                front_20, back_20 = self._generate_motor_matrix(level, intensity_val, pos)
                motors_sdk, f20_scaled, b20_scaled = self._create_sdk_motor_array(front_20, back_20)

                # UI 시각화 상태 기록 (게인/밸런스/마스터 세기 반영값)
                with self._state_lock:
                    self.last_front_motors = f20_scaled
                    self.last_back_motors = b20_scaled
                    self.last_trigger_time = time.time()
                    self.last_duration_ms = duration_ms
                    self.last_level = level
                    self.last_damage_percent = damage_pct

                # 1. 공식 SDK 출력
                if self.sink_cfg.kind == "bhaptics" and HAS_BHAPTICS_SDK and self._connected:
                    try:
                        # position = 0 (TactSuit Pro / Vest)
                        res = bhaptics_python.play_dot(0, duration_ms, motors_sdk)
                        if asyncio.iscoroutine(res) or isinstance(res, asyncio.Future):
                            await res
                    except Exception as e:
                        err_msg = f"공식 SDK play_dot 오류: {e}"
                        self._status_msg = err_msg
                        print(f"[Haptics] {err_msg}")

                # 2. 레거시 WebSocket 출력
                elif self.sink_cfg.kind == "websocket" and self._connected and self._ws:
                    try:
                        dots = [{"Index": i, "Intensity": v} for i, v in enumerate(motors_sdk) if v > 0]
                        payload = {
                            "Submit": [
                                {"Type": "turnOff", "Key": "pokemon_hit"},
                                {
                                    "Type": "frame",
                                    "Key": "pokemon_hit",
                                    "Frame": {
                                        "DurationMillis": duration_ms,
                                        "Position": "Vest",
                                        "DotPoints": dots
                                    }
                                }
                            ]
                        }
                        await self._ws.send(json.dumps(payload))
                    except Exception as e:
                        err_msg = f"레거시 WebSocket 전송 실패: {e}"
                        self._status_msg = err_msg
                        print(f"[Haptics] {err_msg}")

                if burst_idx < hit_count - 1:
                    await asyncio.sleep(detail_row.duration * 0.6 + 0.05)

        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(_async_burst_worker(), self._loop)

    def trigger_damage_haptic(self, damage_percent: float, current_hp_pct: float = 100.0, is_crit: bool = False) -> str:
        """포켓몬 배틀 피격 데미지에 따른 자동 분기 처리"""
        d = self.details_cfg
        level = "light"
        row = d.light

        if current_hp_pct <= 0.0:
            level = "faint"
            row = d.faint
        elif damage_percent <= 20.0:
            level = "light"
            row = d.light
        elif damage_percent <= 50.0:
            level = "medium"
            row = d.medium
        elif damage_percent <= 80.0:
            level = "heavy"
            row = d.heavy
        else:
            level = "critical"
            row = d.critical

        # 크리티컬(급소) 발생 시 타격 횟수 +1 보너스 강화
        if is_crit and level not in ["faint", "critical"]:
            row = HapticDetailRow(
                intensity=min(100, row.intensity + 10),
                duration=min(1.0, row.duration + 0.1),
                hit_count=min(5, row.hit_count + 1),
                position=row.position
            )

        print(f"[Haptics Trigger] Level={level.upper()} | Damage={damage_percent:.1f}% | HP={current_hp_pct:.1f}% | Crit={is_crit}")
        self.trigger_pattern_burst(level, row, damage_pct=damage_percent)
        return level

    def trigger_heartbeat(self) -> None:
        """빨간 피(20% 이하) 심장박동 진동 1회"""
        d = self.details_cfg
        self.trigger_pattern_burst("heartbeat", d.heartbeat, damage_pct=0.0)

    def get_current_motor_intensities(self) -> Tuple[List[float], List[float], str]:
        """UI 시각화를 위한 40개 모터 실시간 감쇄 강도(0~100) 반환"""
        with self._state_lock:
            if self.last_trigger_time <= 0:
                return [0.0] * 20, [0.0] * 20, "none"

            elapsed_ms = (time.time() - self.last_trigger_time) * 1000.0
            total_duration = float(self.last_duration_ms + 350)

            if elapsed_ms >= total_duration:
                return [0.0] * 20, [0.0] * 20, "none"

            decay = max(0.0, 1.0 - (elapsed_ms / total_duration))
            front = [v * decay for v in self.last_front_motors]
            back = [v * decay for v in self.last_back_motors]
            return front, back, self.last_level