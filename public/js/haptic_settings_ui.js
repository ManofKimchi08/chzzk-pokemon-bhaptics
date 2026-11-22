function initMotorGrids() {
  const frontGrid = document.getElementById('frontMotorGrid');
  const backGrid = document.getElementById('backMotorGrid');
  if (!frontGrid || !backGrid) return;
  frontGrid.innerHTML = '';
  backGrid.innerHTML = '';

  for (let i = 0; i < 20; i++) {
    const dotF = document.createElement('div');
    dotF.className = 'motor-dot';
    dotF.id = `f-motor-${i}`;
    frontGrid.appendChild(dotF);

    const dotB = document.createElement('div');
    dotB.className = 'motor-dot';
    dotB.id = `b-motor-${i}`;
    backGrid.appendChild(dotB);
  }
}

let isMotorGridPolling = false;
setInterval(async () => {
  if (isMotorGridPolling) return;
  isMotorGridPolling = true;
  try {
    const res = await fetch('/api/haptic/motors');
    if (!res.ok) return;
    const data = await res.json();

    const ind = document.getElementById('hapticHeaderIndicator');
    const stText = document.getElementById('hapticStatusText');
    if (ind && stText) {
      if (data.connected) {
        ind.classList.add('connected');
        stText.innerText = '슈트 연결됨';
      } else {
        ind.classList.remove('connected');
        stText.innerText = '슈트 미연결';
      }
    }

    if (Array.isArray(data.front)) {
      data.front.forEach((val, idx) => {
        const el = document.getElementById(`f-motor-${idx}`);
        if (el) applyMotorIntensity(el, val, data.level);
      });
    }
    if (Array.isArray(data.back)) {
      data.back.forEach((val, idx) => {
        const el = document.getElementById(`b-motor-${idx}`);
        if (el) applyMotorIntensity(el, val, data.level);
      });
    }
  } catch (e) {
  } finally {
    isMotorGridPolling = false;
  }
}, 100);

function applyMotorIntensity(el, intensity, level) {
  if (intensity <= 1) {
    el.style.backgroundColor = 'rgba(18, 24, 38, 0.5)';
    el.style.borderColor = 'rgba(56, 189, 248, 0.35)';
    el.style.boxShadow = 'none';
    return;
  }

  let color = '#38bdf8';
  if (level === 'medium') color = '#fbbf24';
  else if (level === 'heavy') color = '#f97316';
  else if (level === 'critical' || level === 'faint') color = '#f43f5e';
  else if (level === 'heartbeat') color = '#ec4899';

  el.style.backgroundColor = color;
  el.style.borderColor = color;
  el.style.boxShadow = `0 0 ${Math.round(intensity * 0.22)}px ${color}`;
}

function toggleMainBattleMotor(forceState) {
  const widget = document.getElementById('mainBattleMotorMonitor');
  const btn = document.getElementById('btnToggleMainMotor');
  if (!widget) return;
  const isVisible = (forceState !== undefined) ? forceState : (widget.style.display !== 'flex');
  widget.style.display = isVisible ? 'flex' : 'none';
  if (btn) {
    btn.innerHTML = isVisible ? '<span>✅ 표시 중</span>' : '<span>숨김</span>';
    if (isVisible) {
      btn.style.borderColor = 'rgba(0, 255, 163, 0.4)';
      btn.style.color = '#00ffa3';
    } else {
      btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      btn.style.color = '#94a3b8';
    }
  }
  localStorage.setItem('show_main_battle_motor', isVisible ? 'true' : 'false');
}

(function initMainMotorPreference() {
  const pref = localStorage.getItem('show_main_battle_motor');
  if (pref === 'false') {
    toggleMainBattleMotor(false);
  } else {
    toggleMainBattleMotor(true);
  }
})();

// 🎽 배틀 화면 정면/후면 독립 드래그 이동 지원
function makeBattleUnitDraggable(el, storageKey) {
  if (!el) return;
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const pos = JSON.parse(saved);
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      el.dataset.tx = pos.x;
      el.dataset.ty = pos.y;
    } catch(e) {}
  }

  let isDragging = false;
  let startX, startY, origX, origY;

  el.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    origX = parseFloat(el.dataset.tx || 0);
    origY = parseFloat(el.dataset.ty || 0);
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const curX = origX + dx;
    const curY = origY + dy;
    el.style.transform = `translate(${curX}px, ${curY}px)`;
    el.dataset.tx = curX;
    el.dataset.ty = curY;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = 'grab';
    localStorage.setItem(storageKey, JSON.stringify({
      x: parseFloat(el.dataset.tx || 0),
      y: parseFloat(el.dataset.ty || 0)
    }));
  });
}

(function initBattleMotorDrag() {
  setTimeout(() => {
    makeBattleUnitDraggable(document.getElementById('mainFrontMotorUnit'), 'battle_motor_pos_front');
    makeBattleUnitDraggable(document.getElementById('mainBackMotorUnit'), 'battle_motor_pos_back');
  }, 300);
})();

async function triggerHapticDamage(damagePct, currentHpPct, isCrit = false) {
  try {
    const res = await fetch('/api/haptic/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        damage_percent: damagePct,
        current_hp_pct: currentHpPct,
        is_crit: isCrit
      })
    });
    const data = await res.json();
    const badge = document.getElementById('lastDamageBadge');
    if (badge) {
      badge.innerText = `💥 -${damagePct.toFixed(0)}% (${data.level.toUpperCase()})`;
      badge.style.backgroundColor = '#ef4444';
      badge.style.color = '#fff';
    }
  } catch (e) {
    console.error('Haptic trigger error:', e);
  }
}

async function testHapticPattern(level) {
  try {
    await fetch('/api/haptic/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level })
    });
  } catch (e) {
    console.error('Haptic test error:', e);
  }
}

async function updateMasterIntensity(val) {
  const qVal = document.getElementById('quickIntensityVal');
  if (qVal) qVal.innerText = val + '%';
  try {
    await fetch('/api/haptic/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ haptic: { master_intensity: parseInt(val) } })
    });
  } catch (e) {}
}

// --- Poke Sound Engine UI Controllers ---
function openPokeSoundStudioModal() {
  const m = document.getElementById('pokeSoundStudioModal');
  if (m) {
    m.style.display = 'flex';
    syncSoundStudioUI();
  }
}

function closePokeSoundStudioModal() {
  const m = document.getElementById('pokeSoundStudioModal');
  if (m) m.style.display = 'none';
}

function togglePokeMute() {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.toggleBgmMute();
  syncPokeSoundUI();
}

function togglePokeSfxMute() {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.toggleSfxMute();
  syncPokeSoundUI();
}

function handlePokeVolumeChange(val) {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.setBgmVolume(val);
  syncPokeSoundUI();
}

function handlePokeSfxVolumeChange(val) {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.setSfxVolume(val);
  syncPokeSoundUI();
}

function playPokeBgmStudio(track) {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.playBgm(track, 500);
  syncSoundStudioUI();
}

function stopPokeBgmStudio() {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.stop(400);
  syncSoundStudioUI();
}

function playPokeSeStudio(filename) {
  if (!window.pokeSoundEngine) return;
  window.pokeSoundEngine.playSe(filename, 0.85);
}

function syncPokeSoundUI() {
  if (!window.pokeSoundEngine) return;
  const engine = window.pokeSoundEngine;
  const isMuted = engine.isMuted;
  const vol = engine.bgmVolume;
  const pct = Math.round(vol * 100);

  const iconEl = document.getElementById('pokeSoundMuteIcon');
  const labelEl = document.getElementById('pokeSoundMuteLabel');
  if (iconEl) {
    if (isMuted) {
      iconEl.innerText = '🔇';
      if (labelEl) labelEl.innerText = '해제';
    } else if (engine.isPinchActive) {
      iconEl.innerText = '🚨';
      if (labelEl) labelEl.innerText = '음소거';
    } else {
      iconEl.innerText = '🎵';
      if (labelEl) labelEl.innerText = '음소거';
    }
  }

  const volSlider = document.getElementById('pokeVolumeRange');
  if (volSlider) volSlider.value = engine.bgmVolume;

  const volText = document.getElementById('pokeVolumePercentText');
  if (volText) volText.innerText = `${Math.round(engine.bgmVolume * 100)}%`;

  const sfxMuteIcon = document.getElementById('pokeSfxMuteIcon');
  const sfxLabelEl = document.getElementById('pokeSfxMuteLabel');
  if (sfxMuteIcon) sfxMuteIcon.innerText = engine.isSfxMuted ? '🔇' : '🔊';
  if (sfxLabelEl) sfxLabelEl.innerText = engine.isSfxMuted ? '해제' : '음소거';

  const sfxSlider = document.getElementById('pokeSfxVolumeRange');
  if (sfxSlider) sfxSlider.value = engine.sfxVolume;

  const sfxPctText = document.getElementById('pokeSfxVolumePercentText');
  if (sfxPctText) sfxPctText.innerText = `${Math.round(engine.sfxVolume * 100)}%`;

  const hudCapsule = document.getElementById('pokeSoundHudCapsule');
  if (hudCapsule) {
    if (engine.isPinchActive && !isMuted) {
      hudCapsule.classList.add('pinch-active');
    } else {
      hudCapsule.classList.remove('pinch-active');
    }
  }

  syncSoundStudioUI();
}

function syncSoundStudioUI() {
  if (!window.pokeSoundEngine) return;
  const engine = window.pokeSoundEngine;
  const vol = engine.bgmVolume;
  const pct = Math.round(vol * 100);

  const stdSlider = document.getElementById('studioVolumeRange');
  if (stdSlider) stdSlider.value = vol;

  const stdVolText = document.getElementById('studioVolumeText');
  if (stdVolText) stdVolText.innerText = `${pct}%`;

  const stdMuteIcon = document.getElementById('studioMuteIcon');
  if (stdMuteIcon) {
    stdMuteIcon.innerText = engine.isMuted ? '🔇 음소거 해제' : '🎵 음소거';
  }

  const normalBadge = document.getElementById('badgeNormalPlaying');
  const pinchBadge = document.getElementById('badgePinchPlaying');
  const victoryBadge = document.getElementById('badgeVictoryPlaying');

  if (normalBadge) normalBadge.style.display = (engine.currentTrack === 'normal') ? 'inline-block' : 'none';
  if (pinchBadge) pinchBadge.style.display = (engine.currentTrack === 'pinch') ? 'inline-block' : 'none';
  if (victoryBadge) victoryBadge.style.display = (engine.currentTrack === 'victory') ? 'inline-block' : 'none';

  // Drawer BGM badges
  const dNormal = document.getElementById('drawerBadgeNormal');
  const dPinch = document.getElementById('drawerBadgePinch');
  const dVictory = document.getElementById('drawerBadgeVictory');
  if (dNormal) dNormal.style.display = (engine.currentTrack === 'normal') ? 'inline-block' : 'none';
  if (dPinch) dPinch.style.display = (engine.currentTrack === 'pinch') ? 'inline-block' : 'none';
  if (dVictory) dVictory.style.display = (engine.currentTrack === 'victory') ? 'inline-block' : 'none';
}

if (window.pokeSoundEngine) {
  window.pokeSoundEngine.onPinchStateChange = function(isPinch) {
    syncPokeSoundUI();
  };
  window.pokeSoundEngine.onVolumeChange = function() {
    syncPokeSoundUI();
  };
}

async function submitHapticDisconnect() {
  try {
    const res = await fetch('/api/haptic/disconnect', { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    await loadFullHapticConfig();
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', () => {
  // 🧹 URL 쿼리 파라미터(?reset=1 또는 ?clear=1) 감지 시 자동 초기화
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === '1' || urlParams.get('clear') === '1') {
      localStorage.removeItem('last_chzzk_channel');
      localStorage.removeItem('chzzk_nid_aut');
      localStorage.removeItem('chzzk_nid_ses');
      fetch('/api/haptic/clear-auth', { method: 'POST' }).catch(() => {});
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}

  initMotorGrids();
  syncPokeSoundUI();
  syncPokeBattleSpeedUI();
  if (typeof switchMinigame === 'function') {
    switchMinigame('pokebattle');
  }
  if (typeof loadPokemonDataset === 'function') {
    loadPokemonDataset();
  }
  const savedChannel = localStorage.getItem('last_chzzk_channel');
  const sInput = document.getElementById('streamerSearchInput');
  const dInput = document.getElementById('drawerDirectChannelInput');
  if (savedChannel) {
    if (sInput && !sInput.value) sInput.value = savedChannel;
    if (dInput) dInput.value = savedChannel;
  }
  const savedAut = localStorage.getItem('chzzk_nid_aut');
  const savedSes = localStorage.getItem('chzzk_nid_ses');
  if (savedAut && document.getElementById('drawerNidAuthInput')) document.getElementById('drawerNidAuthInput').value = savedAut;
  if (savedSes && document.getElementById('drawerNidSesInput')) document.getElementById('drawerNidSesInput').value = savedSes;

  loadFullHapticConfig();
  checkPlayerStatus();
  initDrawerHapticAuthFoldState();
  initDrawerHapticParamsFoldState();
  initDrawerBattleFoldStates();
});


  
// ==========================================
// ⚙️ SETTINGS DRAWER & BROADCAST SEARCH LOGIC
// ==========================================
function openHapticModal() {
  openSettingsDrawer('haptic');
}

let currentDrawerTab = 'broadcast';

function openSettingsDrawer(tab = 'broadcast') {
  toggleDockedChatSidebar(false);
  const drawer = document.getElementById('settingsDrawer');
  const backdrop = document.getElementById('settingsDrawerBackdrop');
  if (drawer) drawer.classList.add('is-open');
  if (backdrop) backdrop.classList.add('is-open');
  switchDrawerTab(tab);
  loadFullHapticConfig();
  checkPlayerStatus();
  initDrawerHapticAuthFoldState();
  initDrawerHapticParamsFoldState();
  initDrawerBattleFoldStates();
}

function closeSettingsDrawer() {
  const drawer = document.getElementById('settingsDrawer');
  const backdrop = document.getElementById('settingsDrawerBackdrop');
  if (drawer) drawer.classList.remove('is-open');
  if (backdrop) backdrop.classList.remove('is-open');
}

function switchDrawerTab(tabName) {
  currentDrawerTab = tabName;
  ['broadcast', 'haptic', 'battle'].forEach(t => {
    const btn = document.getElementById(`dTabBtn-${t}`);
    const pane = document.getElementById(`dTabPane-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });
}

function toggleDrawerAdultSettings() {
  const fields = document.getElementById('drawerAdultFields');
  const icon = document.getElementById('drawerAdultToggleIcon');
  if (!fields || !icon) return;
  const isOpen = fields.style.display !== 'none';
  fields.style.display = isOpen ? 'none' : 'flex';
  icon.innerText = isOpen ? '열기 ▼' : '접기 ▲';
}

function clearSavedCookies() {
  localStorage.removeItem('chzzk_nid_aut');
  localStorage.removeItem('chzzk_nid_ses');
  if (document.getElementById('drawerNidAuthInput')) document.getElementById('drawerNidAuthInput').value = '';
  if (document.getElementById('drawerNidSesInput')) document.getElementById('drawerNidSesInput').value = '';
  alert('저장된 19세 방송 쿠키가 브라우저에서 완전히 삭제되었습니다.');
}

// 🧹 저장된 모든 방송 주소, 쿠키, 햅틱 API Key 원클릭 완전 삭제
async function clearAllStoredData() {
  if (!confirm('저장된 방송 주소(채널), 성인 인증 쿠키, 햅틱 App ID / API Key를 모두 삭제하고 초기화하시겠습니까?')) {
    return;
  }

  // 1. 브라우저 로컬 스토리지 삭제
  localStorage.removeItem('last_chzzk_channel');
  localStorage.removeItem('chzzk_nid_aut');
  localStorage.removeItem('chzzk_nid_ses');

  // 2. 화면 입력 필드 비우기
  window.__hasSavedHapticApiKey = false;
  const sInput = document.getElementById('streamerSearchInput');
  const dInput = document.getElementById('drawerDirectChannelInput');
  const nidAut = document.getElementById('drawerNidAuthInput');
  const nidSes = document.getElementById('drawerNidSesInput');
  const dApp = document.getElementById('drawerHapticAppId');
  const dKey = document.getElementById('drawerHapticApiKey');

  if (sInput) sInput.value = '';
  if (dInput) dInput.value = '';
  if (nidAut) nidAut.value = '';
  if (nidSes) nidSes.value = '';
  if (dApp) dApp.value = '';
  if (dKey) {
    dKey.value = '';
    dKey.placeholder = 'bHaptics Developer Portal API Key';
  }

  // 3. 서버 config.json 내 햅틱 키 초기화 및 연결 해제
  try {
    await fetch('/api/haptic/clear-auth', { method: 'POST' });
  } catch (e) {}

  // 4. 방송 연결 해제
  if (typeof disconnectBroadcast === 'function') {
    disconnectBroadcast();
  }

  alert('🧹 저장된 모든 방송 주소, 인증 쿠키, 햅틱 API Key가 깨끗하게 삭제되었습니다.');
  loadFullHapticConfig();
}

// 🧹 햅틱 App ID 및 API Key만 전용 삭제
async function clearHapticKeys() {
  if (!confirm('저장된 햅틱 App ID와 API Key를 삭제하시겠습니까?')) return;
  window.__hasSavedHapticApiKey = false;
  try {
    await fetch('/api/haptic/clear-auth', { method: 'POST' });
  } catch (e) {}
  const dApp = document.getElementById('drawerHapticAppId');
  const dKey = document.getElementById('drawerHapticApiKey');
  if (dApp) dApp.value = '';
  if (dKey) {
    dKey.value = '';
    dKey.placeholder = 'bHaptics Developer Portal API Key';
  }
  alert('🧹 햅틱 App ID와 API Key가 삭제되었습니다.');
  loadFullHapticConfig();
}

// 🔍 Unified Streamer Search & Direct Connect Handler
async function handleUnifiedStreamerConnect() {
  const input = document.getElementById('streamerSearchInput');
  const box = document.getElementById('streamerSearchResults');
  const val = (input?.value || '').trim();

  if (!val) {
    alert('스트리머 닉네임, 치지직 방송 URL 또는 채널 ID를 입력해주세요.');
    if (input) input.focus();
    return;
  }

  // 1. URL 패턴 감지 (예: chzzk.naver.com/live/... 또는 chzzk.naver.com/...)
  const isUrl = /chzzk\.naver\.com/i.test(val) || /^https?:\/\//i.test(val);
  // 2. 32자리 16진수 채널 ID 감지
  const isHexId = /^[a-fA-F0-9]{32}$/.test(val);

  if (isUrl || isHexId) {
    const cid = extractChannelId(val);
    if (!cid) {
      alert('올바른 치지직 채널 ID 또는 방송 URL을 입력해주세요.');
      return;
    }
    if (box) box.style.display = 'none';
    const dDirect = document.getElementById('drawerDirectChannelInput');
    if (dDirect) dDirect.value = cid;
    await executeBroadcastConnect(cid);
    return;
  }

  // 3. 그 외의 닉네임/키워드 -> 스트리머 닉네임 검색 실행
  await searchStreamers();
}

// 🔍 Search Streamers by Nickname via /api/chzzk/search
async function searchStreamers() {
  const input = document.getElementById('streamerSearchInput');
  const box = document.getElementById('streamerSearchResults');
  const query = (input?.value || '').trim();
  if (!query) {
    alert('검색할 스트리머 닉네임을 입력해주세요.');
    if (input) input.focus();
    return;
  }

  box.style.display = 'flex';
  box.innerHTML = '<div style="padding: 14px; text-align: center; color: #94a3b8; font-size: 12px;">🔍 치지직 채널 검색 중...</div>';

  try {
    const res = await fetch(`/api/chzzk/search?keyword=${encodeURIComponent(query)}`);
    const data = await res.json();
    const channels = data.channels || [];

    if (channels.length === 0) {
      box.innerHTML = `
        <div style="padding: 14px; text-align: center; color: #94a3b8; font-size: 12px;">
          일치하는 채널이 없습니다.
          <div style="margin-top: 8px;">
            <button type="button" id="btnDirectConnectFallback" class="btn btn-secondary" style="font-size: 11.5px; padding: 4px 10px;">
              입력값('${escapeHtml(query)}')으로 직접 연결 시도
            </button>
          </div>
        </div>
      `;
      const fbBtn = document.getElementById('btnDirectConnectFallback');
      if (fbBtn) {
        fbBtn.addEventListener('click', () => executeBroadcastConnect(query));
      }
      return;
    }

    box.innerHTML = '';
    const defaultAvatar = 'https://ssl.pstatic.net/cmstatic/nng/img/img_anonymous_square_gray_opacity2x.png';
    channels.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'streamer-result-card';

      const isLive = !!ch.openLive;
      const safeAvatar = (typeof ch.channelImageUrl === 'string' && /^https?:\/\//i.test(ch.channelImageUrl))
        ? ch.channelImageUrl
        : defaultAvatar;
      const liveBadge = isLive
        ? '<span class="live-badge-pill live" style="font-size: 10px; padding: 2px 6px;">🔴 LIVE</span>'
        : '<span class="live-badge-pill offline" style="font-size: 10px; padding: 2px 6px;">OFFLINE</span>';

      card.innerHTML = `
        <div class="streamer-result-meta">
          <img src="${escapeHtml(safeAvatar)}" class="streamer-result-avatar" alt="${escapeHtml(ch.channelName || '')}">
          <div>
            <div class="streamer-result-name">
              <span>${escapeHtml(ch.channelName || '')}</span>
              ${ch.verifiedMark ? '<span title="인증마크" style="color: #38bdf8; font-size: 11px;">✓</span>' : ''}
            </div>
            <div class="streamer-result-sub">
              ${liveBadge}
              <span>팔로워 ${Number(ch.followerCount || 0).toLocaleString()}명</span>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-primary" style="padding: 6px 12px; font-size: 11.5px; font-weight: 800;">
          ${isLive ? '📡 연결' : '선택'}
        </button>
      `;
      const btn = card.querySelector('button');
      if (btn) {
        btn.addEventListener('click', () => connectToStreamer(ch.channelId));
      }
      box.appendChild(card);
    });
  } catch (e) {
    box.innerHTML = `<div style="padding: 14px; text-align: center; color: #ef4444; font-size: 12px;">검색 오류: ${escapeHtml(String(e))}</div>`;
  }
}

async function connectToStreamer(channelId) {
  const sInput = document.getElementById('streamerSearchInput');
  if (sInput) sInput.value = channelId;
  const dDirect = document.getElementById('drawerDirectChannelInput');
  if (dDirect) dDirect.value = channelId;
  const box = document.getElementById('streamerSearchResults');
  if (box) box.style.display = 'none';
  await executeBroadcastConnect(channelId);
}

async function submitDrawerBroadcastConnect() {
  await handleUnifiedStreamerConnect();
}

// Unified broadcast connect flow
async function executeBroadcastConnect(channelId) {
  currentChannelId = channelId;
  localStorage.setItem('last_chzzk_channel', channelId);

  const nidAuth = (document.getElementById('drawerNidAuthInput')?.value || localStorage.getItem('chzzk_nid_aut') || '').trim();
  const nidSes = (document.getElementById('drawerNidSesInput')?.value || localStorage.getItem('chzzk_nid_ses') || '').trim();
  if (nidAuth) localStorage.setItem('chzzk_nid_aut', nidAuth);
  if (nidSes) localStorage.setItem('chzzk_nid_ses', nidSes);

  isManualDisconnect = false;
  reconnectAttempts = 0;
  serverIndexOffset = 0;

  try {
    const res = await fetch('/api/chzzk/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, nidAuth, nidSes })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      if (data.isAdult) {
        toggleDrawerAdultSettings();
        alert(data.error || '🔞 19세(연령 제한) 방송입니다. [19세 설정]에 NID_AUT와 NID_SES 쿠키를 입력해주세요.');
      } else {
        alert('오류: ' + (data.error || '방송 정보를 불러올 수 없습니다.'));
      }
      return;
    }

    currentChannelName = data.channelName || '치지직 방송';
    currentChatChannelId = data.chatChannelId;
    currentAccessToken = data.accessToken;
    currentChannelImageUrl = data.channelImageUrl || '';
    isChannelLive = !!data.isLive;
    currentLiveTitle = data.liveTitle || '';
    currentViewerCount = data.concurrentUserCount || 0;

    // Update Drawer Connected Card
    const card = document.getElementById('drawerConnectedStatusCard');
    const av = document.getElementById('drawerConnectedAvatar');
    const nm = document.getElementById('drawerConnectedName');
    const badge = document.getElementById('drawerConnectedLiveBadge');
    const vw = document.getElementById('drawerConnectedViewers');
    const ttl = document.getElementById('drawerConnectedTitle');

    if (card) card.style.display = 'block';
    const sResultsBox = document.getElementById('streamerSearchResults');
    if (sResultsBox) sResultsBox.style.display = 'none';
    if (av) av.src = currentChannelImageUrl || 'https://ssl.pstatic.net/cmstatic/nng/img/img_anonymous_square_gray_opacity2x.png';
    if (nm) nm.innerText = currentChannelName;
    if (badge) {
      badge.className = isChannelLive ? 'live-badge-pill live' : 'live-badge-pill offline';
      badge.innerText = isChannelLive ? '🔴 LIVE' : 'OFFLINE';
    }
    if (vw) vw.innerText = isChannelLive ? `👥 ${Number(currentViewerCount).toLocaleString()}명 시청 중` : '방송 종료';
    if (ttl) ttl.innerText = currentLiveTitle || '-';

    // Update Header Connection Chip
    const headAv = document.getElementById('headerChannelAvatar');
    const headTxt = document.getElementById('statusText');
    const headVw = document.getElementById('headerViewerCount');
    const headDot = document.getElementById('statusDot');

    if (headAv) {
      headAv.src = currentChannelImageUrl;
      headAv.style.display = currentChannelImageUrl ? 'inline-block' : 'none';
    }
    if (headTxt) headTxt.innerText = currentChannelName;
    if (headVw) {
      headVw.innerText = `(👥 ${Number(currentViewerCount).toLocaleString()}명)`;
      headVw.style.display = 'inline-block';
    }
    if (headDot) headDot.style.background = '#00ffa3';

    // Update arena streamer profile and start status polling
    updateStreamerProfileUI();
    startLiveStatusPolling();

    // Connect chat WebSocket
    connectWebSocketServer();

    // Update chat drawer status pill & hide waiting guide
    const chatLivePill = document.getElementById('dockedChatLivePill');
    if (chatLivePill) {
      chatLivePill.className = isChannelLive ? 'live-badge-pill live' : 'live-badge-pill offline';
      chatLivePill.innerText = isChannelLive ? 'LIVE' : 'OFFLINE';
    }
    const emptyGuide = document.getElementById('dockedChatEmptyGuide');
    if (emptyGuide) emptyGuide.style.display = 'none';

    showToast(`📡 [${currentChannelName}] 방송에 성공적으로 연결되었습니다!`, 'success');
  } catch (e) {
    alert('방송 연결 실패: ' + e);
  }
}

// 🗗 Popout Real-time Haptic Overlay Window
function openHapticOverlayPopout(side = 'both') {
  launchDesktopTransparentOverlay(side);
  let url = '/overlay/haptic';
  if (side !== 'both') url += '?side=' + side;
  window.open(url, 'bHaptics_Overlay_' + side, 'width=380,height=340,resizable=yes,scrollbars=no');
}

function launchDesktopTransparentOverlay(side = 'both') {
  fetch('/api/haptic/open-desktop-overlay?side=' + encodeURIComponent(side))
    .then(r => r.json())
    .catch(() => {});
}

function copyObsOverlayUrl(side = 'both') {
  let path = `${window.location.origin}/overlay/haptic`;
  if (side === 'front') path += '?side=front';
  else if (side === 'back') path += '?side=back';
  navigator.clipboard.writeText(path);
  const sideName = side === 'front' ? '정면 전용' : (side === 'back' ? '후면 전용' : '통합(개별 드래그 가능)');
  alert(`[${sideName}] OBS 브라우저 소스 URL이 복사되었습니다!\n(${path})\n\nOBS [소스 목록] > [+] > [브라우저]에 등록하시면 정면과 후면을 원하는 화면 위치에 따로따로 자유롭게 배치하실 수 있습니다.`);
}

// 🎽 Detailed Haptic Config Loading & Saving
async function checkPlayerStatus() {
  try {
    const res = await fetch('/api/haptic/player-status');
    const data = await res.json();
    const dot = document.getElementById('drawerPlayerDot');
    const text = document.getElementById('drawerPlayerText');
    const btn = document.getElementById('btnLaunchPlayer');

    if (data.running) {
      if (dot) dot.style.background = '#00ffa3';
      if (text) text.innerText = 'bHaptics Player가 정상 실행 중입니다.';
      if (btn) btn.style.display = 'none';
    } else {
      if (dot) dot.style.background = '#ef4444';
      if (text) text.innerText = '⚠️ bHaptics Player가 실행되지 않았습니다.';
      if (btn) btn.style.display = 'inline-flex';
    }
  } catch (e) {}
}

async function launchBhhapticsPlayer() {
  try {
    const res = await fetch('/api/haptic/launch-player', { method: 'POST' });
    const data = await res.json();
    alert(data.message);
    setTimeout(checkPlayerStatus, 1500);
  } catch (e) {
    alert('Player 실행 오류: ' + e);
  }
}

async function loadFullHapticConfig() {
  try {
    const [cfgRes, stRes] = await Promise.all([
      fetch('/api/haptic/config'),
      fetch('/api/haptic/status')
    ]);
    const cfgData = await cfgRes.json();
    const stData = await stRes.json();

    const sink = cfgData.sink || cfgData.haptic || {};
    if (document.getElementById('drawerHapticKind') && sink.kind) document.getElementById('drawerHapticKind').value = sink.kind;
    if (document.getElementById('drawerHapticAppId') && sink.app_id !== undefined) document.getElementById('drawerHapticAppId').value = sink.app_id;
    window.__hasSavedHapticApiKey = !!sink.has_api_key;
    const apiKeyInput = document.getElementById('drawerHapticApiKey');
    if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = sink.has_api_key
        ? `저장된 API Key 있음 (${sink.api_key_masked || '****'}) — 변경 시에만 입력`
        : 'bHaptics Developer Portal API Key';
    }
    if (document.getElementById('drawerHapticMotorCount') && sink.motor_count) document.getElementById('drawerHapticMotorCount').value = String(sink.motor_count);
    if (document.getElementById('drawerMasterIntensity') && sink.master_intensity !== undefined) {
      document.getElementById('drawerMasterIntensity').value = sink.master_intensity;
      document.getElementById('drawerMasterIntVal').innerText = sink.master_intensity + '%';
    }
    if (document.getElementById('drawerHapticFrontGain') && sink.front_gain !== undefined) document.getElementById('drawerHapticFrontGain').value = String(sink.front_gain);
    if (document.getElementById('drawerHapticBackGain') && sink.back_gain !== undefined) document.getElementById('drawerHapticBackGain').value = String(sink.back_gain);

    const d = cfgData.details || {};
    if (document.getElementById('drawerFrontBalance') && d.front_balance !== undefined) {
      document.getElementById('drawerFrontBalance').value = d.front_balance;
      document.getElementById('drawerFrontBalVal').innerText = d.front_balance + '%';
    }
    if (document.getElementById('drawerBackBalance') && d.back_balance !== undefined) {
      document.getElementById('drawerBackBalance').value = d.back_balance;
      document.getElementById('drawerBackBalVal').innerText = d.back_balance + '%';
    }

    ['light', 'medium', 'heavy', 'critical', 'faint', 'heartbeat'].forEach(lvl => {
      if (d[lvl]) {
        if (document.getElementById(`det-${lvl}-int`)) document.getElementById(`det-${lvl}-int`).value = d[lvl].intensity;
        if (document.getElementById(`det-${lvl}-dur`)) document.getElementById(`det-${lvl}-dur`).value = d[lvl].duration;
        if (document.getElementById(`det-${lvl}-hit`)) document.getElementById(`det-${lvl}-hit`).value = d[lvl].hit_count;
        if (document.getElementById(`det-${lvl}-pos`)) document.getElementById(`det-${lvl}-pos`).value = d[lvl].position;
      }
    });

    if (document.getElementById('drawerEnableHeartbeat')) {
      document.getElementById('drawerEnableHeartbeat').checked = !!cfgData.enable_heartbeat;
    }

    // Status banner
    const dot = document.getElementById('drawerHapticDot');
    const stText = document.getElementById('drawerHapticStatusText');
    if (dot && stText) {
      dot.style.background = stData.connected ? '#00ffa3' : '#ef4444';
      stText.innerText = '상태: ' + (stData.status_msg || (stData.connected ? '연결됨' : '미연결'));
    }
  } catch (e) {
    console.warn('Haptic config load error:', e);
  }
}

function onDrawerHapticKindChange() {
  const kind = document.getElementById('drawerHapticKind')?.value || 'bhaptics';
  const authGroup = document.getElementById('drawerSdkAuthGroup');
  if (authGroup) authGroup.style.display = (kind === 'bhaptics') ? 'flex' : 'none';
}

// 🔑 bHaptics Auth (App ID / API Key) 접기/펼치기 토글
function toggleDrawerHapticAuthFields() {
  const body = document.getElementById('drawerHapticAuthBody');
  const icon = document.getElementById('drawerHapticAuthToggleIcon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'flex' : 'none';
  if (icon) icon.innerText = isHidden ? '접기 ▲' : '열기 ▼';
  localStorage.setItem('drawer_haptic_auth_folded', isHidden ? 'false' : 'true');
}

// 🔑 bHaptics Auth 접기 상태 초기 복원
function initDrawerHapticAuthFoldState() {
  const isFolded = localStorage.getItem('drawer_haptic_auth_folded') === 'true';
  const body = document.getElementById('drawerHapticAuthBody');
  const icon = document.getElementById('drawerHapticAuthToggleIcon');
  if (body && isFolded) {
    body.style.display = 'none';
    if (icon) icon.innerText = '열기 ▼';
  }
}

// 🎛️ 슈트 진동 & 피격 세부 옵션 접기/펼치기 토글
function toggleDrawerHapticParamsFields() {
  const body = document.getElementById('drawerHapticParamsBody');
  const icon = document.getElementById('drawerHapticParamsToggleIcon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'flex' : 'none';
  if (icon) icon.innerText = isHidden ? '접기 ▲' : '열기 ▼';
  localStorage.setItem('drawer_haptic_params_folded', isHidden ? 'false' : 'true');
}

// 🎛️ 슈트 진동 & 피격 세부 옵션 접기 상태 초기 복원
function initDrawerHapticParamsFoldState() {
  const isFolded = localStorage.getItem('drawer_haptic_params_folded') === 'true';
  const body = document.getElementById('drawerHapticParamsBody');
  const icon = document.getElementById('drawerHapticParamsToggleIcon');
  if (body && isFolded) {
    body.style.display = 'none';
    if (icon) icon.innerText = '열기 ▼';
  }
}

// ⚔️ 배틀 모드 & 규칙 접기/펼치기 토글
function toggleDrawerBattleRules() {
  const body = document.getElementById('drawerBattleRulesBody');
  const icon = document.getElementById('drawerBattleRulesToggleIcon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'flex' : 'none';
  if (icon) icon.innerText = isHidden ? '접기 ▲' : '열기 ▼';
  try { localStorage.setItem('drawer_battle_rules_folded', isHidden ? 'false' : 'true'); } catch (e) {}
}

// 🔊 배틀 볼륨 & 사운드 접기/펼치기 토글
function toggleDrawerBattleSound() {
  const body = document.getElementById('drawerBattleSoundBody');
  const icon = document.getElementById('drawerBattleSoundToggleIcon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'flex' : 'none';
  if (icon) icon.innerText = isHidden ? '접기 ▲' : '열기 ▼';
  try { localStorage.setItem('drawer_battle_sound_folded', isHidden ? 'false' : 'true'); } catch (e) {}
}

// 🎶 BGM 테마 재생 및 테스트 접기/펼치기 토글
function toggleDrawerBgmTest() {
  const body = document.getElementById('drawerBgmTestBody');
  const icon = document.getElementById('drawerBgmTestToggleIcon');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'grid' : 'none';
  if (icon) icon.innerText = isHidden ? '접기 ▲' : '열기 ▼';
  try { localStorage.setItem('drawer_bgm_test_folded', isHidden ? 'false' : 'true'); } catch (e) {}
}

// ⚔️ 배틀 설정 접기 상태 초기 복원
function initDrawerBattleFoldStates() {
  try {
    if (localStorage.getItem('drawer_battle_rules_folded') === 'true') {
      const body = document.getElementById('drawerBattleRulesBody');
      const icon = document.getElementById('drawerBattleRulesToggleIcon');
      if (body) body.style.display = 'none';
      if (icon) icon.innerText = '열기 ▼';
    }
    if (localStorage.getItem('drawer_battle_sound_folded') === 'true') {
      const body = document.getElementById('drawerBattleSoundBody');
      const icon = document.getElementById('drawerBattleSoundToggleIcon');
      if (body) body.style.display = 'none';
      if (icon) icon.innerText = '열기 ▼';
    }
    if (localStorage.getItem('drawer_bgm_test_folded') === 'true') {
      const body = document.getElementById('drawerBgmTestBody');
      const icon = document.getElementById('drawerBgmTestToggleIcon');
      if (body) body.style.display = 'none';
      if (icon) icon.innerText = '열기 ▼';
    }
  } catch (e) {}
}

// 👁️ bHaptics 서랍 App ID / API Key 마스킹(***) 해제 토글
function toggleDrawerHapticKeyVisibility(show) {
  const appId = document.getElementById('drawerHapticAppId');
  const apiKey = document.getElementById('drawerHapticApiKey');
  if (appId) appId.type = show ? 'text' : 'password';
  if (apiKey) apiKey.type = show ? 'text' : 'password';
}



async function saveAllHapticSettings() {
  const kind = document.getElementById('drawerHapticKind')?.value || 'bhaptics';
  const appId = document.getElementById('drawerHapticAppId')?.value.trim() || '';
  const apiKey = document.getElementById('drawerHapticApiKey')?.value.trim() || '';
  const count = parseInt(document.getElementById('drawerHapticMotorCount')?.value || '32');
  const masterInt = parseInt(document.getElementById('drawerMasterIntensity')?.value || '100');
  const frontGain = parseFloat(document.getElementById('drawerHapticFrontGain')?.value || '1.0');
  const backGain = parseFloat(document.getElementById('drawerHapticBackGain')?.value || '1.0');

  const sinkPayload = {
    kind,
    app_id: appId,
    motor_count: count,
    front_gain: frontGain,
    back_gain: backGain,
    master_intensity: masterInt
  };
  if (apiKey && !apiKey.startsWith('****')) {
    sinkPayload.api_key = apiKey;
  }

  const frontBal = parseInt(document.getElementById('drawerFrontBalance')?.value || '100');
  const backBal = parseInt(document.getElementById('drawerBackBalance')?.value || '100');

  const details = {
    front_balance: frontBal,
    back_balance: backBal
  };

  ['light', 'medium', 'heavy', 'critical', 'faint', 'heartbeat'].forEach(lvl => {
    details[lvl] = {
      intensity: parseInt(document.getElementById(`det-${lvl}-int`)?.value || '100'),
      duration: parseFloat(document.getElementById(`det-${lvl}-dur`)?.value || '0.3'),
      hit_count: parseInt(document.getElementById(`det-${lvl}-hit`)?.value || '1'),
      position: document.getElementById(`det-${lvl}-pos`)?.value || 'All'
    };
  });

  const enableHb = document.getElementById('drawerEnableHeartbeat')?.checked !== false;

  try {
    const res = await fetch('/api/haptic/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sink: sinkPayload,
        details,
        enable_heartbeat: enableHb
      })
    });
    const data = await res.json();
    if (data.sink) {
      window.__hasSavedHapticApiKey = !!data.sink.has_api_key;
      const keyInput = document.getElementById('drawerHapticApiKey');
      if (keyInput && data.sink.has_api_key) {
        keyInput.value = '';
        keyInput.placeholder = `저장된 API Key 있음 (${data.sink.api_key_masked || '****'}) — 변경 시에만 입력`;
      }
    }
    alert(data.message || '설정이 config.json에 성공적으로 저장되었습니다!');
  } catch (e) {
    alert('설정 저장 실패: ' + e);
  }
}

async function submitDrawerHapticConnect() {
  const kind = document.getElementById('drawerHapticKind')?.value || 'bhaptics';
  const appId = document.getElementById('drawerHapticAppId')?.value.trim() || '';
  const apiKey = document.getElementById('drawerHapticApiKey')?.value.trim() || '';
  const count = parseInt(document.getElementById('drawerHapticMotorCount')?.value || '32');
  const frontGain = parseFloat(document.getElementById('drawerHapticFrontGain')?.value || '1.0');
  const backGain = parseFloat(document.getElementById('drawerHapticBackGain')?.value || '1.0');

  if (kind === 'bhaptics' && (!appId || (!apiKey && !window.__hasSavedHapticApiKey))) {
    alert('App ID와 API Key가 비어 있습니다. bHaptics Developer Portal에서 발급받은 App ID와 API Key를 입력해주세요.');
    return;
  }

  // Save settings first
  await saveAllHapticSettings();

  const connectSink = {
    kind,
    app_id: appId,
    motor_count: count,
    front_gain: frontGain,
    back_gain: backGain
  };
  if (apiKey && !apiKey.startsWith('****')) {
    connectSink.api_key = apiKey;
  }

  try {
    const res = await fetch('/api/haptic/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sink: connectSink })
    });
    const data = await res.json();
    alert(data.message);
    loadFullHapticConfig();
  } catch (e) {
    alert('슈트 연결 오류: ' + e);
  }
}

async function testCustomLevel(level) {
  try {
    await fetch('/api/haptic/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level })
    });
  } catch (e) {}
}

  
function setTurnTimeLimit(sec) {
  const numSec = parseFloat(sec) || 30.0;
  const vSel = document.getElementById('pokeVoteDurationSelect');
  if (vSel && String(vSel.value) !== String(numSec)) vSel.value = String(numSec);
  const dSel = document.getElementById('drawerTurnLimitSelect');
  if (dSel && String(dSel.value) !== String(numSec)) dSel.value = String(numSec);
  if (typeof pokeBattleState !== 'undefined') {
    pokeBattleState.turnTimerTotal = numSec;
    pokeBattleState.turnTimerRemaining = numSec;
    pokeBattleState.viewersTimerTotal = numSec;
    pokeBattleState.viewersTimerRemaining = numSec;
    if (typeof renderPokeTurnTimerUI === 'function') {
      renderPokeTurnTimerUI();
    }
  }
}

function openPokeAnimTesterModal() {
  const modal = document.getElementById('pokeAnimTesterModal');
  if (!modal) return;
  const select = document.getElementById('animTesterMove');
  if (select) {
    select.innerHTML = '';
    const moveSet = new Set(['몸통박치기', '발버둥']);
    if (Array.isArray(allPokemonData)) {
      allPokemonData.forEach(p => {
        if (Array.isArray(p.moves)) {
          p.moves.forEach(mv => { if (mv && mv.name) moveSet.add(mv.name); });
        }
      });
    }
    const moves = Array.from(moveSet).sort((a, b) => a.localeCompare(b, 'ko'));
    moves.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });
  }
  modal.style.display = 'flex';
}

function closePokeAnimTesterModal() {
  const modal = document.getElementById('pokeAnimTesterModal');
  if (modal) modal.style.display = 'none';
}

async function triggerPokeAnimPreview() {
  const actor = document.getElementById('animTesterActor')?.value || 'streamer';
  const move = document.getElementById('animTesterMove')?.value || '10만볼트';
  const isCrit = !!document.getElementById('animTesterCrit')?.checked;
  const isMiss = !!document.getElementById('animTesterMiss')?.checked;

  closePokeAnimTesterModal();

  const isStreamer = actor === 'streamer';
  const userPokeName = isStreamer 
    ? ((streamerTeam && streamerTeam[streamerActiveIdx]?.pokemon?.name) || '리자몽')
    : ((viewersTeam && viewersTeam[viewersActiveIdx]?.pokemon?.name) || '피카츄');

  setBattleDialogue(`${isStreamer ? '👑' : '👥'} <b>${userPokeName}</b>의 <b>[${move}]</b>!`);

  if (typeof playPokeMoveAnimation === 'function') {
    await playPokeMoveAnimation(actor, move, { hit: !isMiss, isCrit: isCrit, typeMult: 2.0 });
  }

  if (isMiss) {
    setBattleDialogue(`💨 하지만 <b>[${userPokeName}]</b>의 공격은 빗나갔다!`);
  } else {
    let msg = `💥 상대에게 데미지를 입혔다!`;
    if (isCrit) msg += ` <b style="color: #f59e0b;">(급소에 맞았다!)</b>`;
    setBattleDialogue(msg);
  }
}


(function handleUrlActions() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action === 'settings') {
    let tries = 0;
    const check = setInterval(() => {
      tries++;
      if (typeof openSettingsDrawer === 'function') {
        clearInterval(check);
        openSettingsDrawer('battle');
      } else if (tries >= 100) {
        clearInterval(check);
      }
    }, 30);
  } else if (action === 'picker') {
    let tries = 0;
    const check = setInterval(() => {
      tries++;
      if (typeof allPokemonData !== 'undefined' && allPokemonData.length > 0 && typeof openPokemonPicker === 'function') {
        clearInterval(check);
        openPokemonPicker('streamer');
      } else if (tries >= 100) {
        clearInterval(check);
      }
    }, 30);
  }
})();
