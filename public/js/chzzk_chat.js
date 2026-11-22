// ==========================================
// 📡 CHZZK BROADCAST & CHAT ENGINE
// ==========================================
let ws = null;
let isConnected = false;
let isManualDisconnect = false;
let reconnectAttempts = 0;
let serverIndexOffset = 0;
let pingInterval = null;
let liveStatusPollingInterval = null;
let reconnectTimer = null;

let currentChannelId = '';
let currentChatChannelId = '';
let currentChannelName = '';
let currentChannelImageUrl = '';
let currentAccessToken = '';
let currentLiveTitle = '';
let currentViewerCount = 0;
let isChannelLive = false;
let chatLogCount = 0;
let chatRateCount = 0;

let chatAutoScrollEnabled = true;
let dockedChatActiveFilter = 'all'; // 'all' | 'sub' | 'cheese'
let dockedChatSearchQuery = '';
let popoutWindowRef = null;

function getStreamerName() {
  return (isConnected && currentChannelName && currentChannelName.trim()) ? currentChannelName : '스트리머';
}

function getStreamerAvatar() {
  return (isConnected && currentChannelImageUrl) ? currentChannelImageUrl : '';
}

function updateStreamerProfileUI() {
  const name = getStreamerName();
  const avatar = getStreamerAvatar();

  const headerAvatar = document.getElementById('headerChannelAvatar');
  if (headerAvatar) {
    if (avatar) {
      headerAvatar.src = avatar;
      headerAvatar.style.display = 'inline-block';
    } else {
      headerAvatar.style.display = 'none';
    }
  }

  const pokeSetupName = document.getElementById('pokeStreamerSetupName');
  if (pokeSetupName) pokeSetupName.innerText = `👑 ${name} 팀`;

  const pokeSetupAvatar = document.getElementById('pokeStreamerSetupAvatar');
  if (pokeSetupAvatar) {
    if (avatar) {
      pokeSetupAvatar.src = avatar;
      pokeSetupAvatar.style.display = 'inline-block';
    } else {
      pokeSetupAvatar.style.display = 'none';
    }
  }

  const topAvatar = document.getElementById('arenaStreamerTopAvatar');
  if (topAvatar) {
    if (avatar) {
      topAvatar.src = avatar;
      topAvatar.style.display = 'inline-block';
    } else {
      topAvatar.style.display = 'none';
    }
  }
  const topName = document.getElementById('arenaStreamerTopName');
  if (topName) topName.innerText = `👑 ${name}`;

  const statusAvatar = document.getElementById('arenaStreamerStatusAvatar');
  if (statusAvatar) {
    if (avatar) {
      statusAvatar.src = avatar;
      statusAvatar.style.display = 'inline-block';
    } else {
      statusAvatar.style.display = 'none';
    }
  }
  const statusName = document.getElementById('arenaStreamerStatusName');
  if (statusName) statusName.innerText = `👑 ${name}`;
}

function extractChannelId(rawInput) {
  if (!rawInput) return '';
  rawInput = rawInput.trim();
  const hexMatch = rawInput.match(/[a-fA-F0-9]{32}/);
  if (hexMatch) return hexMatch[0];
  const urlMatch = rawInput.match(/chzzk\.naver\.com\/(?:live\/)?([a-zA-Z0-9]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  return rawInput.replace(/https?:\/\//i, '').split('/')[0].split('?')[0].trim();
}

function getChzzkChatServers(chatCid) {
  let hash = 0;
  for (let i = 0; i < chatCid.length; i++) {
    hash = ((hash << 5) - hash) + chatCid.charCodeAt(i);
    hash |= 0;
  }
  const serverNum = (Math.abs(hash) % 10) + 1;
  return [
    `wss://kr-ss${serverNum}.chat.naver.com/chat`,
    `wss://kr-ss1.chat.naver.com/chat`,
    `wss://kr-ss2.chat.naver.com/chat`,
    `wss://kr-ss3.chat.naver.com/chat`
  ];
}

function resetConnectionUI() {
  const drawerCard = document.getElementById('drawerConnectedStatusCard');
  if (drawerCard) drawerCard.style.display = 'none';

  const headAv = document.getElementById('headerChannelAvatar');
  if (headAv) headAv.style.display = 'none';
  const headVw = document.getElementById('headerViewerCount');
  if (headVw) headVw.style.display = 'none';

  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  if (statusText) statusText.innerText = '방송 미연결 [연결 설정]';
  if (statusDot) statusDot.style.background = '#64748b';

  const chatLivePill = document.getElementById('dockedChatLivePill');
  if (chatLivePill) {
    chatLivePill.className = 'live-badge-pill offline';
    chatLivePill.innerText = 'OFFLINE';
  }
  updateStreamerProfileUI();
}

function disconnectBroadcast() {
  isManualDisconnect = true;
  isConnected = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (e) {}
    ws = null;
  }
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (liveStatusPollingInterval) { clearInterval(liveStatusPollingInterval); liveStatusPollingInterval = null; }

  currentChannelName = '';
  currentChannelImageUrl = '';
  resetConnectionUI();
  const emptyGuide = document.getElementById('dockedChatEmptyGuide');
  if (emptyGuide) emptyGuide.style.display = 'block';

  showToast('🛑 방송 연결이 종료되었습니다.', 'ℹ️');
}

// Alias for backward compatibility
function connectChzzkChatWebSocket(chatChannelId, accessToken, channelId) {
  if (chatChannelId) currentChatChannelId = chatChannelId;
  if (accessToken) currentAccessToken = accessToken;
  if (channelId) currentChannelId = channelId;
  updateStreamerProfileUI();
  startLiveStatusPolling();
  connectWebSocketServer();
}

function connectWebSocketServer() {
  if (!currentChatChannelId || !currentAccessToken) {
    console.warn('Cannot connect WS: missing chatChannelId or accessToken');
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const serverList = getChzzkChatServers(currentChatChannelId);
  const targetWsUrl = serverList[serverIndexOffset % serverList.length];

  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (e) {}
    ws = null;
  }

  let localWs;
  try {
    localWs = new WebSocket(targetWsUrl);
    ws = localWs;
  } catch (err) {
    console.error('WebSocket init error:', err);
    return;
  }

  localWs.onopen = () => {
    if (ws !== localWs) return;
    const connectPayload = {
      ver: "2",
      cmd: 100,
      svcid: "game",
      cid: currentChatChannelId,
      bdy: {
        accTkn: currentAccessToken,
        auth: "READ",
        devType: 2001,
        uid: null
      },
      tid: 1
    };
    localWs.send(JSON.stringify(connectPayload));

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws === localWs && localWs.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ ver: "2", cmd: 0 }));
      }
    }, 20000);
  };

  localWs.onmessage = (event) => {
    if (ws !== localWs) return;
    try {
      const data = JSON.parse(event.data);

      if (data.cmd === 10100 || data.cmd === 10000) {
        isConnected = true;
        reconnectAttempts = 0;
        updateStreamerProfileUI();
        const emptyGuide = document.getElementById('dockedChatEmptyGuide');
        if (emptyGuide) emptyGuide.style.display = 'none';
      }

      if ((data.cmd === 93101 || data.cmd === 93102 || data.cmd === 93103 || data.cmd === 93104) && Array.isArray(data.bdy)) {
        data.bdy.forEach(item => processChatMessage(item));
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  };

  localWs.onerror = (e) => {
    console.warn('WebSocket error:', e);
  };

  localWs.onclose = () => {
    if (ws !== localWs) return;
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    if (!isManualDisconnect) {
      reconnectAttempts++;
      serverIndexOffset++;
      const waitTime = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
      reconnectTimer = setTimeout(connectWebSocketServer, waitTime);
    } else {
      isConnected = false;
    }
  };
}

function startLiveStatusPolling() {
  if (liveStatusPollingInterval) clearInterval(liveStatusPollingInterval);
  liveStatusPollingInterval = setInterval(async () => {
    if (!isConnected || isManualDisconnect || !currentChannelId) return;
    try {
      const nidAuth = (document.getElementById('drawerNidAuthInput')?.value || localStorage.getItem('chzzk_nid_aut') || '').trim();
      const nidSes = (document.getElementById('drawerNidSesInput')?.value || localStorage.getItem('chzzk_nid_ses') || '').trim();
      const res = await fetch('/api/chzzk/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: currentChannelId, nidAuth, nidSes })
      });
      const data = await res.json();
      if (data && !data.error) {
        currentViewerCount = data.concurrentUserCount || 0;
        isChannelLive = !!data.isLive;
        currentLiveTitle = data.liveTitle || currentLiveTitle;

        const headVw = document.getElementById('headerViewerCount');
        if (headVw) {
          headVw.innerText = isChannelLive ? `(👥 ${Number(currentViewerCount).toLocaleString()}명)` : '(오프라인)';
          headVw.style.display = 'inline-block';
        }

        const drawerVw = document.getElementById('drawerConnectedViewers');
        const drawerBadge = document.getElementById('drawerConnectedLiveBadge');
        const drawerTitle = document.getElementById('drawerConnectedTitle');
        const chatLivePill = document.getElementById('dockedChatLivePill');

        if (drawerVw) drawerVw.innerText = isChannelLive ? `👥 ${Number(currentViewerCount).toLocaleString()}명 시청 중` : '방송 종료';
        if (drawerBadge) {
          drawerBadge.className = isChannelLive ? 'live-badge-pill live' : 'live-badge-pill offline';
          drawerBadge.innerText = isChannelLive ? '🔴 LIVE' : 'OFFLINE';
        }
        if (drawerTitle) drawerTitle.innerText = currentLiveTitle || '-';
        if (chatLivePill) {
          chatLivePill.className = isChannelLive ? 'live-badge-pill live' : 'live-badge-pill offline';
          chatLivePill.innerText = isChannelLive ? 'LIVE' : 'OFFLINE';
        }
      }
    } catch (e) {}
  }, 20000);
}

function parseDonatorStatus(profileData) {
  let isDonator = false;
  let donatorLevel = 0;
  const badges = [...(profileData.viewerBadges || []), ...(profileData.activityBadges || [])];
  for (const b of badges) {
    const badgeObj = b.badge || b;
    const text = (String(badgeObj.badgeId || '') + ' ' + String(badgeObj.title || '') + ' ' + String(badgeObj.description || '')).toLowerCase();
    if (text.includes('donation') || text.includes('cheese') || text.includes('fan') || text.includes('후원') || text.includes('치즈')) {
      isDonator = true;
      donatorLevel = Math.max(donatorLevel, 1);
    }
  }
  return { isDonator, donatorLevel };
}

function parseLiveDonation(item, profileData) {
  let isDonation = item.msgTypeCode === 10 || item.msgTypeCode === '10' || item.msgTypeCode === 11 || item.msgTypeCode === '11';
  let payAmount = 0;
  if (item.extras) {
    try {
      const extras = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;
      if (extras.payAmount || extras.donationAmount || extras.cheeseAmount || extras.amount) {
        isDonation = true;
        payAmount = Number(extras.payAmount || extras.donationAmount || extras.cheeseAmount || extras.amount || 0);
      }
    } catch (e) {}
  }
  if (!isDonation && profileData?.streamingProperty?.donation?.amount) {
    isDonation = true;
    payAmount = Number(profileData.streamingProperty.donation.amount || 0);
  }
  return { isDonation, payAmount };
}

function processChatMessage(item) {
  chatLogCount++;
  const chatBadge = document.getElementById('chatBadgeCount');
  if (chatBadge) chatBadge.innerText = chatLogCount.toLocaleString();
  const dockedBadge = document.getElementById('dockedChatCountBadge');
  if (dockedBadge) dockedBadge.innerText = chatLogCount.toLocaleString();

  let profileData = {};
  try {
    profileData = JSON.parse(item.profile || '{}');
  } catch (e) {}

  const nickname = profileData.nickname || (item.uid ? item.uid.substring(0, 8) : '시청자');
  const msgText = item.msg || profileData.msg || '';
  const uid = item.uid || ('guest_' + Math.random().toString(36).substring(2, 8));

  const sp = profileData.streamingProperty || {};
  const subInfo = sp.subscription || null;
  const isSubscriber = !!subInfo;

  const { isDonator } = parseDonatorStatus(profileData);
  const donationInfo = parseLiveDonation(item, profileData);
  const now = new Date().toLocaleTimeString('ko-KR');

  // 1. Route to Live Pokemon Battle Chat Vote
  try {
    if (typeof handleLivePokeBattleChatVote === 'function') {
      handleLivePokeBattleChatVote(nickname, msgText, uid, now);
    }
  } catch (err) {
    console.warn('Poke battle chat vote error:', err);
  }

  // 2. Add message to Docked Chat Feed
  addChatToFeed(nickname, msgText, now, isSubscriber, isDonator, donationInfo.isDonation ? donationInfo.payAmount : 0);
}

function toggleDockedChatSidebar(forceState = null) {
  const sidebar = document.getElementById('dockedChatSidebar');
  const backdrop = document.getElementById('chatDrawerBackdrop');
  const floatBtn = document.getElementById('floatingChatTabBtn');
  if (!sidebar) return;

  const isCurrentlyOpen = sidebar.classList.contains('is-open');
  const willOpen = forceState !== null ? forceState : !isCurrentlyOpen;

  if (willOpen) {
    closeSettingsDrawer();
    sidebar.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');
    if (floatBtn) {
      floatBtn.classList.add('is-open');
      floatBtn.classList.remove('is-collapsed');
    }
    if (chatAutoScrollEnabled) {
      setTimeout(scrollChatToBottom, 120);
    }
  } else {
    sidebar.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
    if (floatBtn) {
      floatBtn.classList.remove('is-open');
      floatBtn.classList.add('is-collapsed');
    }
  }
}

function toggleChatAutoScroll(enabled) {
  chatAutoScrollEnabled = enabled;
  const floatBtn = document.getElementById('chatNewMsgFloatingBtn');
  if (floatBtn && enabled) floatBtn.style.display = 'none';
  if (enabled) scrollChatToBottom();
}

function scrollChatToBottom() {
  const feed = document.getElementById('dockedChatFeed');
  if (feed) {
    feed.scrollTop = feed.scrollHeight;
    const floatBtn = document.getElementById('chatNewMsgFloatingBtn');
    if (floatBtn) floatBtn.style.display = 'none';
  }
}

function clearDockedChatFeed() {
  const feed = document.getElementById('dockedChatFeed');
  if (feed) {
    feed.innerHTML = `
      <div id="dockedChatEmptyGuide" class="docked-chat-empty" style="${isConnected ? 'display: none;' : ''}">
        <div style="font-size: 28px; margin-bottom: 8px;">💬</div>
        <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">채팅 기록이 비워졌습니다.</div>
        <div style="font-size: 11px;">새로운 시청자 채팅이 실시간으로 여기에 추가됩니다.</div>
      </div>
    `;
  }
  chatLogCount = 0;
  const chatBadge = document.getElementById('chatBadgeCount');
  if (chatBadge) chatBadge.innerText = '0';
  const dockedBadge = document.getElementById('dockedChatCountBadge');
  if (dockedBadge) dockedBadge.innerText = '0';
}

function setChatSidebarFilter(type) {
  dockedChatActiveFilter = type;
  document.querySelectorAll('.docked-chat-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === type);
  });
  applyDockedChatFilters();
}

function filterDockedChatItems(query) {
  dockedChatSearchQuery = (query || '').trim().toLowerCase();
  const clearBtn = document.getElementById('dockedChatSearchClearBtn');
  if (clearBtn) clearBtn.style.display = dockedChatSearchQuery ? 'inline-block' : 'none';
  applyDockedChatFilters();
}

function clearChatSidebarSearch() {
  const input = document.getElementById('dockedChatSearchInput');
  if (input) input.value = '';
  dockedChatSearchQuery = '';
  const clearBtn = document.getElementById('dockedChatSearchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  applyDockedChatFilters();
}

function applyDockedChatFilters() {
  const feed = document.getElementById('dockedChatFeed');
  if (!feed) return;
  const items = feed.querySelectorAll('.docked-chat-item');
  items.forEach(el => {
    let visible = true;
    const isSub = el.dataset.sub === 'true';
    const isDonor = el.dataset.donor === 'true';
    const nick = (el.dataset.nick || '').toLowerCase();
    const msg = (el.dataset.msg || '').toLowerCase();

    if (dockedChatActiveFilter === 'sub' && !isSub) visible = false;
    if (dockedChatActiveFilter === 'cheese' && !isDonor) visible = false;
    if (dockedChatSearchQuery && !nick.includes(dockedChatSearchQuery) && !msg.includes(dockedChatSearchQuery)) {
      visible = false;
    }
    el.style.display = visible ? 'flex' : 'none';
  });
}

function popoutChatWindow() {
  if (popoutWindowRef && !popoutWindowRef.closed) {
    popoutWindowRef.focus();
    return;
  }
  const title = `${currentChannelName || '치지직'} 실시간 채팅`;
  popoutWindowRef = window.open('', 'ChzzkChatPopout', 'width=420,height=750,menubar=no,toolbar=no,location=no,status=no');
  if (!popoutWindowRef) {
    alert('팝업 차단이 감지되었습니다. 팝업을 허용해주세요.');
    return;
  }
  popoutWindowRef.document.write(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { margin: 0; padding: 12px; background: #080c14; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
        .header { padding: 10px 14px; background: #121826; border-radius: 8px; font-weight: 800; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border: 1px solid #232a3b; }
        #feed { display: flex; flex-direction: column; gap: 6px; }
        .item { padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; line-height: 1.4; word-break: break-all; }
        .nick { font-weight: 800; color: #00ffa3; margin-right: 6px; }
        .badge { display: inline-block; padding: 1px 5px; font-size: 10px; font-weight: 800; border-radius: 4px; margin-right: 4px; background: rgba(255,215,0,0.2); color: #ffd700; }
        .badge-sub { background: rgba(168,85,247,0.2); color: #c084fc; }
        .time { font-size: 10px; color: #64748b; float: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <span>💬 ${escapeHtml(title)}</span>
        <span style="color:#00ffa3; font-size:11px;">🔴 LIVE</span>
      </div>
      <div id="feed"></div>
    </body>
    </html>
  `);
  popoutWindowRef.document.close();
}

function addChatToFeed(nickname, msg, time, isSub, isDonor, payAmount = 0) {
  chatRateCount++;

  const dockedFeed = document.getElementById('dockedChatFeed');
  if (dockedFeed) {
    const emptyGuide = document.getElementById('dockedChatEmptyGuide');
    if (emptyGuide) emptyGuide.style.display = 'none';

    const itemEl = document.createElement('div');
    const isCheeseDonation = isDonor || payAmount > 0;
    itemEl.className = 'docked-chat-item' + (isCheeseDonation ? ' is-donation' : '');
    itemEl.dataset.sub = isSub ? 'true' : 'false';
    itemEl.dataset.donor = isCheeseDonation ? 'true' : 'false';
    itemEl.dataset.nick = nickname;
    itemEl.dataset.msg = msg;

    let badgesHtml = '';
    if (isSub) {
      badgesHtml += `<span class="badge-tag badge-sub" style="font-size: 9.5px; padding: 1px 5px;">⭐ 구독</span>`;
    }
    if (isCheeseDonation) {
      badgesHtml += `<span class="badge-tag badge-follow" style="font-size: 9.5px; padding: 1px 5px; background: rgba(255, 215, 0, 0.25); color: #ffd700; border: 1px solid rgba(255,215,0,0.4);">🧀 ${payAmount ? payAmount.toLocaleString() + '치즈' : '후원'}</span>`;
    }

    const nickClass = isCheeseDonation ? 'docked-chat-nick donor' : (isSub ? 'docked-chat-nick sub' : 'docked-chat-nick');

    itemEl.innerHTML = `
      <div class="docked-chat-header-row">
        ${badgesHtml}
        <span class="${nickClass}">${escapeHtml(nickname)}</span>
        <span class="docked-chat-time">${time}</span>
      </div>
      <div class="docked-chat-msg">${escapeHtml(msg)}</div>
    `;

    let visible = true;
    if (dockedChatActiveFilter === 'sub' && !isSub) visible = false;
    if (dockedChatActiveFilter === 'cheese' && !isCheeseDonation) visible = false;
    if (dockedChatSearchQuery) {
      const lowerNick = nickname.toLowerCase();
      const lowerMsg = msg.toLowerCase();
      if (!lowerNick.includes(dockedChatSearchQuery) && !lowerMsg.includes(dockedChatSearchQuery)) {
        visible = false;
      }
    }
    itemEl.style.display = visible ? 'flex' : 'none';

    dockedFeed.appendChild(itemEl);

    if (dockedFeed.children.length > 150) {
      dockedFeed.removeChild(dockedFeed.firstChild);
    }

    const isNearBottom = (dockedFeed.scrollHeight - dockedFeed.scrollTop - dockedFeed.clientHeight) < 60;
    if (chatAutoScrollEnabled || isNearBottom) {
      dockedFeed.scrollTop = dockedFeed.scrollHeight;
    } else {
      const floatBtn = document.getElementById('chatNewMsgFloatingBtn');
      if (floatBtn) floatBtn.style.display = 'block';
    }

    const countBadge = document.getElementById('dockedChatCountBadge');
    if (countBadge) countBadge.innerText = chatLogCount.toLocaleString();
    const floatBadge = document.getElementById('floatingChatBadge');
    if (floatBadge) floatBadge.innerText = chatLogCount.toLocaleString();
    const chatBadge = document.getElementById('chatBadgeCount');
    if (chatBadge) chatBadge.innerText = chatLogCount.toLocaleString();
  }

  // Mirror to Popout Window if opened
  if (popoutWindowRef && !popoutWindowRef.closed) {
    try {
      const pFeed = popoutWindowRef.document.getElementById('feed');
      if (pFeed) {
        const pDiv = popoutWindowRef.document.createElement('div');
        pDiv.className = 'item';
        let pBadge = '';
        if (isSub) pBadge += '<span class="badge badge-sub">⭐구독</span>';
        if (isDonor || payAmount > 0) pBadge += `<span class="badge">🧀${payAmount ? payAmount.toLocaleString() + '치즈' : '후원'}</span>`;
        pDiv.innerHTML = `
          <span class="time">${time}</span>
          ${pBadge}
          <span class="nick">${escapeHtml(nickname)}</span>
          <span>${escapeHtml(msg)}</span>
        `;
        pFeed.appendChild(pDiv);
        if (pFeed.children.length > 80) pFeed.removeChild(pFeed.firstChild);
        popoutWindowRef.window.scrollTo(0, popoutWindowRef.document.body.scrollHeight);
      }
    } catch (e) {}
  }
}

function escapeHtml(text) {
  return text ? text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  }) : '';
}

function showToast(msg, icon = '🎉') {
  const toast = document.getElementById('appToast');
  const toastText = document.getElementById('appToastText');
  const toastIcon = document.getElementById('appToastIcon');
  if (!toast) return;
  toastText.innerText = msg;
  toastIcon.innerText = icon;
  toast.classList.add('active');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => {
    toast.classList.remove('active');
  }, 2800);
}

