import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from copy import deepcopy
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import config  # noqa: E402
from config import AppConfig, HapticDetailRow, SinkConfig  # noqa: E402
from haptic_engine import HapticEngine  # noqa: E402
import server  # noqa: E402


class TestConfigLoadingAndClamping(unittest.TestCase):
    def test_load_ignores_unknown_keys_and_clamps_preserving_credentials(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cfg_path = os.path.join(tmpdir, "config.json")
            payload = {
                "sink": {
                    "kind": "websocket",
                    "app_id": "my_app_id",
                    "api_key": "my_secret_api_key",
                    "motor_count": 999,
                    "front_gain": 9.5,
                    "back_gain": -1.2,
                    "master_intensity": 250,
                },
                "details": {
                    "front_balance": 140,
                    "back_balance": -20,
                    "light": {
                        "intensity": 120,
                        "duration": 99.0,
                        "hit_count": 10,
                        "position": "InvalidZone",
                        "extra_unknown_key": "should_be_ignored",
                    },
                },
                "enable_heartbeat": False,
            }
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(payload, f)

            loaded = AppConfig.load(cfg_path)
            self.assertEqual(loaded.sink.kind, "websocket")
            self.assertEqual(loaded.sink.app_id, "my_app_id")
            self.assertEqual(loaded.sink.api_key, "my_secret_api_key")
            self.assertEqual(loaded.sink.motor_count, 32)
            self.assertEqual(loaded.sink.front_gain, 3.0)
            self.assertEqual(loaded.sink.back_gain, 0.0)
            self.assertEqual(loaded.sink.master_intensity, 100)
            self.assertEqual(loaded.details.front_balance, 100)
            self.assertEqual(loaded.details.back_balance, 0)
            self.assertEqual(loaded.details.light.intensity, 100)
            self.assertEqual(loaded.details.light.duration, 5.0)
            self.assertEqual(loaded.details.light.hit_count, 5)
            self.assertEqual(loaded.details.light.position, "All")
            self.assertFalse(loaded.enable_heartbeat)


class TestHapticEngine(unittest.TestCase):
    def setUp(self):
        self.cfg = AppConfig()
        self.engine = HapticEngine(self.cfg)

    def tearDown(self):
        self.engine.disconnect()

    def test_motor_array_lengths_and_clamping_32_and_40(self):
        front_20 = [120] * 20
        back_20 = [80] * 20

        self.engine.sink_cfg.motor_count = 32
        self.engine.sink_cfg.front_gain = 2.0
        sdk_32, f_scaled, b_scaled = self.engine._create_sdk_motor_array(front_20, back_20)
        self.assertEqual(len(sdk_32), 32)
        self.assertEqual(len(f_scaled), 20)
        self.assertEqual(len(b_scaled), 20)
        self.assertTrue(all(0 <= v <= 100 for v in sdk_32))

        self.engine.sink_cfg.motor_count = 40
        sdk_40, _, _ = self.engine._create_sdk_motor_array(front_20, back_20)
        self.assertEqual(len(sdk_40), 40)
        self.assertTrue(all(0 <= v <= 100 for v in sdk_40))

    def test_get_status_does_not_hold_state_lock_during_ipc(self):
        def slow_player_status():
            time.sleep(0.3)
            return {"has_sdk": True, "installed": False, "running": False}

        with patch.object(self.engine, "get_player_status", side_effect=slow_player_status):
            status_result = {}

            def worker():
                status_result["val"] = self.engine.get_status()

            t = threading.Thread(target=worker)
            t.start()
            time.sleep(0.05)

            t0 = time.perf_counter()
            front, back, lvl = self.engine.get_current_motor_intensities()
            elapsed = time.perf_counter() - t0

            t.join(timeout=2.0)

        self.assertLess(elapsed, 0.05)
        self.assertEqual(len(front), 20)
        self.assertEqual(len(back), 20)
        self.assertIn("player_running", status_result["val"])

    def test_stop_all_increments_burst_generation(self):
        gen_before = self.engine._burst_generation
        self.engine.last_front_motors = [50] * 20
        self.engine.last_level = "heavy"
        self.engine.stop_all()
        self.assertGreater(self.engine._burst_generation, gen_before)
        self.assertEqual(self.engine.last_front_motors, [0] * 20)
        self.assertEqual(self.engine.last_level, "none")


class TestServerSecurityAndEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._orig_config_exists = os.path.exists(config.CONFIG_FILE)
        cls._orig_config_bytes = None
        if cls._orig_config_exists:
            with open(config.CONFIG_FILE, "rb") as f:
                cls._orig_config_bytes = f.read()

        cls.httpd = server.ReusableThreadingServer(("127.0.0.1", 0), server.CombinedServerHandler)
        cls.port = cls.httpd.server_port
        cls.base_url = f"http://127.0.0.1:{cls.port}"
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        if cls._orig_config_exists and cls._orig_config_bytes is not None:
            with open(config.CONFIG_FILE, "wb") as f:
                f.write(cls._orig_config_bytes)
            reloaded = AppConfig.load(config.CONFIG_FILE)
            server.app_config.sink = reloaded.sink
            server.app_config.details = reloaded.details
            server.app_config.enable_heartbeat = reloaded.enable_heartbeat

    def setUp(self):
        server.app_config.sink = SinkConfig(
            kind="bhaptics",
            app_id="test_app_id",
            api_key="secret-key-12345678",
            motor_count=32,
            front_gain=1.0,
            back_gain=1.0,
            master_intensity=100,
        )
        server.haptic_engine.sink_cfg = server.app_config.sink
        server.haptic_engine.haptic_cfg = server.app_config.sink

    def _request(self, method, path, body=None, headers=None):
        req_headers = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.base_url + path, data=data, headers=req_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as he:
            return he.code, dict(he.headers), he.read()

    def test_get_haptic_config_redacts_plaintext_api_key(self):
        status, _, raw = self._request("GET", "/api/haptic/config")
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        for key_group in ("sink", "haptic"):
            self.assertNotIn("api_key", data[key_group])
            self.assertTrue(data[key_group]["has_api_key"])
            self.assertEqual(data[key_group]["api_key_masked"], "****5678")

    def test_post_haptic_config_preserves_key_when_empty_or_masked(self):
        with patch.object(server.app_config, "save", return_value=None):
            status, _, raw = self._request(
                "POST",
                "/api/haptic/config",
                body={"sink": {"app_id": "test_app_id", "api_key": "", "master_intensity": 80}},
            )
            self.assertEqual(status, 200)
            self.assertEqual(server.app_config.sink.api_key, "secret-key-12345678")
            self.assertEqual(server.app_config.sink.master_intensity, 80)
            resp_json = json.loads(raw.decode("utf-8"))
            self.assertNotIn("api_key", resp_json["sink"])
            self.assertTrue(resp_json["sink"]["has_api_key"])

            status2, _, _ = self._request(
                "POST",
                "/api/haptic/config",
                body={"sink": {"api_key": "****5678"}},
            )
            self.assertEqual(status2, 200)
            self.assertEqual(server.app_config.sink.api_key, "secret-key-12345678")

    def test_post_haptic_config_rejects_invalid_numbers_with_400(self):
        with patch.object(server.app_config, "save", return_value=None):
            status, _, raw = self._request(
                "POST",
                "/api/haptic/config",
                body={"sink": {"master_intensity": "abc"}},
            )
        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(raw.decode("utf-8")))

    def test_cors_and_origin_enforcement(self):
        # Cross-origin GET must not expose Access-Control-Allow-Origin
        status, headers, _ = self._request(
            "GET", "/api/haptic/config", headers={"Origin": "https://evil.example"}
        )
        self.assertEqual(status, 200)
        lower_headers = {k.lower(): v for k, v in headers.items()}
        self.assertNotIn("access-control-allow-origin", lower_headers)

        # Cross-origin POST must be blocked with 403
        post_status, _, _ = self._request(
            "POST",
            "/api/haptic/trigger",
            body={"damage_percent": 50, "current_hp_pct": 50},
            headers={"Origin": "https://evil.example"},
        )
        self.assertEqual(post_status, 403)

        # Same-origin POST must be allowed and echo Origin
        same_origin = f"http://127.0.0.1:{self.port}"
        ok_status, ok_headers, _ = self._request(
            "POST",
            "/api/haptic/test",
            body={"level": "stop"},
            headers={"Origin": same_origin},
        )
        self.assertEqual(ok_status, 200)
        ok_lower = {k.lower(): v for k, v in ok_headers.items()}
        self.assertEqual(ok_lower.get("access-control-allow-origin"), same_origin)

    def test_clear_auth_resets_saved_api_key(self):
        with patch.object(server.app_config, "save", return_value=None):
            status, _, _ = self._request("POST", "/api/haptic/clear-auth", body={})
        self.assertEqual(status, 200)
        _, _, raw = self._request("GET", "/api/haptic/config")
        data = json.loads(raw.decode("utf-8"))
        self.assertFalse(data["sink"]["has_api_key"])
        self.assertEqual(data["sink"]["app_id"], "")

    def test_static_assets_serve_200_ok(self):
        paths = [
            "/",
            "/css/style.css",
            "/js/chzzk_chat.js",
            "/js/battle_engine.js",
            "/js/haptic_settings_ui.js",
            "/overlay/haptic",
            "/pokemon_data.json",
            "/audio/hit.wav",
        ]
        for path in paths:
            status, _, raw = self._request("GET", path)
            self.assertEqual(status, 200, f"Failed GET {path}")
            self.assertGreater(len(raw), 0, f"Empty body for GET {path}")


if __name__ == "__main__":
    unittest.main()
