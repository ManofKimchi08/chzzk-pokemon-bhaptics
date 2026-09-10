import os
import sys
import json
import re
import urllib.request
import urllib.error
import http.server
import webbrowser
import threading
from urllib.parse import urlparse, parse_qs, quote

# Windows 콘솔 환경 보호
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

DEFAULT_PORT = int(os.environ.get('PORT', 8000))

# PyInstaller 번들 리소스 및 실행 경로 처리
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    EXE_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

candidate_web_dir = os.path.join(BUNDLE_DIR, 'public')
if os.path.exists(candidate_web_dir):
    WEB_DIR = candidate_web_dir
else:
    WEB_DIR = os.path.join(EXE_DIR, 'public')

import atexit
from dataclasses import asdict
from config import AppConfig, SinkConfig, HapticConfig, DetailedHapticConfig, HapticDetailRow
from haptic_engine import HapticEngine
from desktop_overlay import DesktopHapticOverlay

# 설정 및 햅틱 엔진 전역 초기화
app_config = AppConfig.load()
haptic_engine = HapticEngine(app_config)

# 프로세스 종료 시 햅틱 자원 안전 해제 (stop_all & close)
atexit.register(lambda: haptic_engine.disconnect())
atexit.register(lambda: DesktopHapticOverlay.get_instance().stop())

# 기동 시 저장된 App ID/API Key가 있다면 자동 연결 시도
if app_config.sink.kind == "bhaptics" and app_config.sink.app_id and app_config.sink.api_key:
    threading.Thread(target=lambda: haptic_engine.connect(), daemon=True).start()

def extract_channel_id(raw_input):
    if not raw_input:
        return ''
    raw_input = raw_input.strip()
    hex_match = re.search(r'[a-fA-F0-9]{32}', raw_input)
    if hex_match:
        return hex_match.group(0)
    url_match = re.search(r'chzzk\.naver\.com/(?:live/)?([a-zA-Z0-9]+)', raw_input)
    if url_match:
        return url_match.group(1)
    return re.sub(r'[^a-zA-Z0-9]', '', raw_input)

class CombinedServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        try:
            msg = format % args
            msg = re.sub(r'nidAuth=[^&\s]+', 'nidAuth=***', msg)
            msg = re.sub(r'nidSes=[^&\s]+', 'nidSes=***', msg)
            if sys.stderr:
                sys.stderr.write("%s - - [%s] %s\n" %
                                 (self.address_string(),
                                  self.log_date_time_string(),
                                  msg))
        except Exception:
            pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length <= 0:
            return {}
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(body)
        except Exception:
            return {}

    def send_json(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlparse(self.path)

        # 0. 햅틱 모니터 독립 오버레이 페이지 서빙
        if parsed.path in ['/overlay/haptic', '/overlay/haptic/']:
            overlay_file = os.path.join(WEB_DIR, 'overlay_haptic.html')
            if os.path.exists(overlay_file):
                with open(overlay_file, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_error(404, "Overlay file not found")
                return

        # 1. 햅틱 상태 조회
        elif parsed.path == '/api/haptic/status':
            self.send_json(haptic_engine.get_status())
            return

        # 1-1. bHaptics Player 구동 및 설치 상태 조회
        elif parsed.path == '/api/haptic/player-status':
            self.send_json(haptic_engine.get_player_status())
            return

        # 1-2. 윈도우 바탕화면 완전 투명 데스크톱 오버레이 창 띄우기
        elif parsed.path == '/api/haptic/open-desktop-overlay':
            try:
                qs = parse_qs(parsed.query)
                side = qs.get('side', ['both'])[0]
                from desktop_overlay import DesktopHapticOverlay
                DesktopHapticOverlay.get_instance(haptic_engine).start(side=side)
                self.send_json({"success": True, "message": f"Desktop overlay started ({side})"})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            return

        # 2. 햅틱 모터 실시간 강도 조회 (UI 2D 시각화용)
        elif parsed.path == '/api/haptic/motors':
            front, back, level = haptic_engine.get_current_motor_intensities()
            self.send_json({
                "front": [round(v, 1) for v in front],
                "back": [round(v, 1) for v in back],
                "level": level,
                "connected": haptic_engine.is_connected()
            })
            return

        # 3. 햅틱 설정 조회
        elif parsed.path == '/api/haptic/config':
            sink_dict = {
                "kind": app_config.sink.kind,
                "app_id": app_config.sink.app_id,
                "api_key": app_config.sink.api_key,
                "motor_count": app_config.sink.motor_count,
                "front_gain": app_config.sink.front_gain,
                "back_gain": app_config.sink.back_gain,
                "ws_url": app_config.sink.ws_url,
                "master_intensity": app_config.sink.master_intensity
            }
            self.send_json({
                "sink": sink_dict,
                "haptic": sink_dict,
                "details": {
                    "front_balance": app_config.details.front_balance,
                    "back_balance": app_config.details.back_balance,
                    "light": app_config.details.light.__dict__,
                    "medium": app_config.details.medium.__dict__,
                    "heavy": app_config.details.heavy.__dict__,
                    "critical": app_config.details.critical.__dict__,
                    "faint": app_config.details.faint.__dict__,
                    "heartbeat": app_config.details.heartbeat.__dict__
                },
                "enable_heartbeat": app_config.enable_heartbeat
            })
            return

        # 4. 치지직 채널 검색
        elif parsed.path.startswith('/api/chzzk/search'):
            qs = parse_qs(parsed.query)
            keyword = qs.get('keyword', [''])[0].strip()
            if not keyword:
                self.send_json({'channels': []})
                return

            search_url = f"https://api.chzzk.naver.com/service/v1/search/channels?keyword={quote(keyword)}&offset=0&size=30"
            api_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
            try:
                req = urllib.request.Request(search_url, headers=api_headers)
                with urllib.request.urlopen(req, timeout=8) as resp:
                    search_res = json.loads(resp.read().decode('utf-8'))

                raw_items = search_res.get('content', {}).get('data', [])
                channels = []
                for item in raw_items:
                    ch = item.get('channel', {})
                    if ch and ch.get('channelId'):
                        channels.append({
                            'channelId': ch.get('channelId'),
                            'channelName': ch.get('channelName', ''),
                            'channelImageUrl': ch.get('channelImageUrl', ''),
                            'followerCount': int(ch.get('followerCount', 0)),
                            'openLive': bool(ch.get('openLive', False)),
                            'verifiedMark': bool(ch.get('verifiedMark', False))
                        })

                channels.sort(key=lambda x: x.get('followerCount', 0), reverse=True)
                self.send_json({'channels': channels})
                return
            except Exception as e:
                self.send_json({'error': f'채널 검색 오류: {str(e)}', 'channels': []}, status=500)
                return

        # 5. 치지직 방송 상세 정보 및 채팅 접근 토큰 프록시
        elif parsed.path.startswith('/api/chzzk/'):
            qs = parse_qs(parsed.query)
            raw_channel_id = qs.get('channelId', [''])[0]
            nid_auth = qs.get('nidAuth', [''])[0].strip()
            nid_ses = qs.get('nidSes', [''])[0].strip()
            channel_id = extract_channel_id(raw_channel_id)

            if not channel_id:
                self.send_json({'error': '유효한 채널 ID 또는 방송 URL을 입력해주세요.'}, status=400)
                return

            api_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
            if nid_auth and nid_ses:
                api_headers['Cookie'] = f"NID_AUT={nid_auth}; NID_SES={nid_ses}"

            try:
                # 1. 라이브 디테일 조회
                detail_url = f"https://api.chzzk.naver.com/service/v2/channels/{channel_id}/live-detail"
                req = urllib.request.Request(detail_url, headers=api_headers)
                try:
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        detail_data = json.loads(resp.read().decode('utf-8'))
                except urllib.error.HTTPError as he:
                    if he.code in [4001, 403, 400]:
                        self.send_json({
                            'error': '🔞 19세(연령 제한) 방송입니다. [19세 방송 설정]에 NID_AUT와 NID_SES 쿠키를 입력해주세요.',
                            'isAdult': True
                        }, status=403)
                        return
                    raise he

                res_code = detail_data.get('code')
                res_msg = detail_data.get('message', '')
                content_obj = detail_data.get('content') or {}

                if res_code == 4001 or '연령' in str(res_msg) or '성인' in str(res_msg) or (not content_obj and not nid_auth):
                    if not content_obj:
                        self.send_json({
                            'error': '🔞 19세(연령 제한) 방송입니다. [19세 방송 설정]에 NID_AUT와 NID_SES 쿠키를 입력해주세요.',
                            'isAdult': True
                        }, status=403)
                        return

                chat_cid = content_obj.get('chatChannelId')
                status = content_obj.get('status', 'CLOSE')
                is_live = (status == 'OPEN')
                live_title = content_obj.get('liveTitle', '')
                channel_name = content_obj.get('channel', {}).get('channelName', '')
                concurrent_user_count = content_obj.get('concurrentUserCount', 0)
                category = content_obj.get('liveCategoryValue', '')
                open_date = content_obj.get('openDate', '')
                channel_image = content_obj.get('channel', {}).get('channelImageUrl', '')

                if not chat_cid:
                    try:
                        chan_url = f"https://api.chzzk.naver.com/service/v1/channels/{channel_id}"
                        c_req = urllib.request.Request(chan_url, headers=api_headers)
                        with urllib.request.urlopen(c_req, timeout=10) as c_resp:
                            chan_data = json.loads(c_resp.read().decode('utf-8'))
                            channel_name = chan_data.get('content', {}).get('channelName', channel_name)
                            channel_image = chan_data.get('content', {}).get('channelImageUrl', channel_image)
                    except Exception:
                        pass

                if not chat_cid:
                    self.send_json({'error': '채팅 채널 ID를 찾을 수 없습니다. 올바른 치지직 채널인지 확인해 주세요.'}, status=404)
                    return

                # 2. 채팅 토큰 발급
                token_url = f"https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId={chat_cid}&chatType=STREAMING"
                t_req = urllib.request.Request(token_url, headers=api_headers)
                with urllib.request.urlopen(t_req, timeout=10) as t_resp:
                    token_data = json.loads(t_resp.read().decode('utf-8'))

                access_token = token_data.get('content', {}).get('accessToken')
                extra_token = token_data.get('content', {}).get('extraToken')

                res_payload = {
                    'channelId': channel_id,
                    'chatChannelId': chat_cid,
                    'channelName': channel_name or '치지직 방송',
                    'liveTitle': live_title,
                    'status': status,
                    'isLive': is_live,
                    'concurrentUserCount': concurrent_user_count,
                    'category': category,
                    'openDate': open_date,
                    'channelImageUrl': channel_image,
                    'accessToken': access_token,
                    'extraToken': extra_token,
                    'isAdult': content_obj.get('adult', False)
                }
                self.send_json(res_payload)
            except urllib.error.HTTPError as he:
                self.send_json({'error': f'치지직 API 호출 오류 ({he.code})'}, status=he.code)
            except Exception as e:
                self.send_json({'error': f'서버 통신 오류: {str(e)}'}, status=500)
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # 0. bHaptics Player 실행 시도
        if parsed.path == '/api/haptic/launch-player':
            ok = haptic_engine.launch_player()
            self.send_json({
                "success": ok,
                "message": "bHaptics Player 실행을 시도했습니다." if ok else "bHaptics Player를 직접 실행해주세요.",
                "player_status": haptic_engine.get_player_status()
            })
            return

        # 0-1. 윈도우 바탕화면 완전 투명 데스크톱 오버레이 창 띄우기
        elif parsed.path == '/api/haptic/open-desktop-overlay':
            try:
                body = self.read_json_body()
                qs = parse_qs(parsed.query)
                side = body.get('side') or qs.get('side', ['both'])[0]
                from desktop_overlay import DesktopHapticOverlay
                DesktopHapticOverlay.get_instance(haptic_engine).start(side=side)
                self.send_json({"success": True, "message": f"Desktop overlay started ({side})"})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            return

        # 1. 햅틱 연결
        elif parsed.path == '/api/haptic/connect':
            body = self.read_json_body()
            sink_data = body.get('sink', body)
            kind = sink_data.get('kind', app_config.sink.kind)
            app_id = sink_data.get('app_id', app_config.sink.app_id).strip()
            api_key = sink_data.get('api_key', app_config.sink.api_key).strip()
            motor_count = int(sink_data.get('motor_count', app_config.sink.motor_count))
            front_gain = float(sink_data.get('front_gain', app_config.sink.front_gain))
            back_gain = float(sink_data.get('back_gain', app_config.sink.back_gain))
            master_intensity = int(sink_data.get('master_intensity', app_config.sink.master_intensity))

            app_config.sink.kind = kind
            app_config.sink.app_id = app_id
            app_config.sink.api_key = api_key
            app_config.sink.motor_count = motor_count
            app_config.sink.front_gain = front_gain
            app_config.sink.back_gain = back_gain
            app_config.sink.master_intensity = master_intensity
            app_config.save()

            # 공식 SDK 모드일 때 App ID / API Key 검증
            if kind == 'bhaptics' and (not app_id or not api_key):
                self.send_json({
                    "success": False,
                    "message": "App ID와 API Key가 비어 있습니다. bHaptics Developer Portal에서 발급받은 App ID와 API Key를 입력해주세요.",
                    "status": haptic_engine.get_status()
                })
                return

            ok, msg = haptic_engine.connect(app_id=app_id, api_key=api_key, kind=kind, motor_count=motor_count, front_gain=front_gain, back_gain=back_gain)
            self.send_json({"success": ok, "message": msg, "status": haptic_engine.get_status()})
            return

        # 2. 햅틱 연결 해제
        elif parsed.path == '/api/haptic/disconnect':
            haptic_engine.disconnect()
            self.send_json({"success": True, "message": "연결이 종료되었습니다.", "status": haptic_engine.get_status()})
            return

        # 3. 배틀 피격 햅틱 트리거
        elif parsed.path == '/api/haptic/trigger':
            body = self.read_json_body()
            damage_pct = float(body.get('damage_percent', 0.0))
            current_hp_pct = float(body.get('current_hp_pct', 100.0))
            is_crit = bool(body.get('is_crit', False))

            level = haptic_engine.trigger_damage_haptic(damage_pct, current_hp_pct, is_crit)
            self.send_json({
                "success": True,
                "level": level,
                "damage_percent": damage_pct,
                "current_hp_pct": current_hp_pct
            })
            return

        # 4. 수동 테스트 패턴 발사
        elif parsed.path == '/api/haptic/test':
            body = self.read_json_body()
            level = body.get('level', 'light').lower()

            if level == 'heartbeat':
                haptic_engine.trigger_heartbeat()
            elif level in ['light', 'medium', 'heavy', 'critical', 'faint']:
                detail_row = getattr(app_config.details, level)
                haptic_engine.trigger_pattern_burst(level, detail_row, damage_pct=50.0)
            elif level == 'stop':
                haptic_engine.stop_all()

            self.send_json({"success": True, "level": level})
            return

        # 5. 설정 업데이트 및 config.json 저장
        elif parsed.path in ['/api/haptic/config', '/api/haptic/settings']:
            body = self.read_json_body()
            sink_data = body.get('sink') or body.get('haptic') or {}
            d_data = body.get('details', {})

            if 'kind' in sink_data: app_config.sink.kind = str(sink_data['kind']).strip()
            if 'app_id' in sink_data: app_config.sink.app_id = str(sink_data['app_id']).strip()
            if 'api_key' in sink_data: app_config.sink.api_key = str(sink_data['api_key']).strip()
            if 'motor_count' in sink_data: app_config.sink.motor_count = int(sink_data['motor_count'])
            if 'front_gain' in sink_data: app_config.sink.front_gain = float(sink_data['front_gain'])
            if 'back_gain' in sink_data: app_config.sink.back_gain = float(sink_data['back_gain'])
            if 'master_intensity' in sink_data: app_config.sink.master_intensity = int(sink_data['master_intensity'])

            if 'front_balance' in d_data: app_config.details.front_balance = int(d_data['front_balance'])
            if 'back_balance' in d_data: app_config.details.back_balance = int(d_data['back_balance'])

            for k in ['light', 'medium', 'heavy', 'critical', 'faint', 'heartbeat']:
                if k in d_data and isinstance(d_data[k], dict):
                    row = getattr(app_config.details, k)
                    if 'intensity' in d_data[k]: row.intensity = int(d_data[k]['intensity'])
                    if 'duration' in d_data[k]: row.duration = float(d_data[k]['duration'])
                    if 'hit_count' in d_data[k]: row.hit_count = int(d_data[k]['hit_count'])
                    if 'position' in d_data[k]: row.position = str(d_data[k]['position'])

            if 'enable_heartbeat' in body:
                app_config.enable_heartbeat = bool(body['enable_heartbeat'])

            app_config.save()
            self.send_json({
                "success": True,
                "message": "설정이 config.json에 성공적으로 저장되었습니다.",
                "sink": asdict(app_config.sink)
            })
            return

        # 6. 인증 정보 및 설정 완전 초기화 (API Key 및 연결 해제)
        elif parsed.path in ['/api/haptic/clear-auth', '/api/clear-all']:
            app_config.sink.app_id = ""
            app_config.sink.api_key = ""
            haptic_engine.disconnect()
            app_config.save()
            self.send_json({
                "success": True,
                "message": "모든 API Key 및 인증 정보가 초기화되었습니다.",
                "status": haptic_engine.get_status()
            })
            return

        self.send_json({'error': 'Not Found'}, status=404)

def find_available_port(start_port=8000, max_attempts=50):
    import socket
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('', p))
                return p
            except OSError:
                continue
    return start_port

class ReusableThreadingServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    is_cloud = bool(os.environ.get('PORT'))
    port = DEFAULT_PORT if is_cloud else find_available_port(DEFAULT_PORT)
    server_address = ('', port)

    print("==================================================")
    print("  치지직 x 포켓몬 배틀 x bHaptics 촉각슈트 시스템  ")
    print("==================================================")
    print(f" * 웹 대시보드 URL: http://localhost:{port}")
    print(f" * 정적 리소스 경로: {WEB_DIR}")
    print(f" * bHaptics SDK 상태: {'연결 시도' if app_config.haptic.app_id else 'App ID 설정 대기'}")
    print("==================================================")

    httpd = ReusableThreadingServer(server_address, CombinedServerHandler)

    if not is_cloud and '--no-browser' not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(f'http://localhost:{port}')).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다...")
        haptic_engine.disconnect()
        httpd.server_close()