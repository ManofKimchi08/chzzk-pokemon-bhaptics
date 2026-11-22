function setPokeBattleMode(val) {
  pokeBattleMode = val;
  const sel = document.getElementById('pokeBattleModeSelect');
  if (sel && sel.value !== val) sel.value = val;
  const dSel = document.getElementById('drawerBattleModeSelect');
  if (dSel && dSel.value !== val) dSel.value = val;
  if (typeof handleBattleModeChange === 'function') {
    handleBattleModeChange();
  }
}

function syncPokeBattleMode(val) {
  setPokeBattleMode(val);
}

function syncPokeVoteDuration(val) {
  const sec = parseInt(val, 10) || 30;
  if (typeof setTurnTimeLimit === 'function') {
    setTurnTimeLimit(sec);
  }
}

function isSlotForcedStruggle(slot) {
  if (!slot || !slot.pokemon || !Array.isArray(slot.pokemon.moves) || slot.pokemon.moves.length === 0) {
    return true;
  }
  return !slot.pokemon.moves.some((m, idx) => {
    const ppObj = slot.movesPP ? slot.movesPP[idx] : null;
    const currentPP = ppObj ? ppObj.currentPP : (m.pp || 15);
    const isOutOfPP = currentPP <= 0;
    const isChoiceLocked = slot.choiceMove && slot.choiceMove.name !== m.name;
    const isAssaultVestBlocked = slot.item === 'assault_vest' && m.category === '변화';
    return !isOutOfPP && !isChoiceLocked && !isAssaultVestBlocked;
  });
}

function syncPokeStreamerDuration(val) {}
function syncPokeTurnDuration(val) {}

var allPokemonData = [];
var allPokemonItems = [];
var allMegaEvolutions = [];
var pokeTypeChart = {};

var currentMinigame = 'pokebattle';
var pokeBattleMode = '3v3'; // '3v3' or '1v1'
var streamerSetupSlotIdx = 0;
var viewersSetupSlotIdx = 0;
var pokePickerTarget = 'streamer';
var pokePickerSlotIdx = 0;
var currentPokeTypeFilter = 'all';

var streamerTeamHasMegaEvolved = false;
var viewersTeamHasMegaEvolved = false;
var streamerMegaSelected = false;

var streamerTeam = [
  { pokemon: null, item: 'charizardite_x', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 },
  { pokemon: null, item: 'gengarite', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 },
  { pokemon: null, item: 'focus_sash', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 }
];

var viewersTeam = [
  { pokemon: null, item: 'focus_sash', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 },
  { pokemon: null, item: 'blastoisinite', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 },
  { pokemon: null, item: 'choice_band', currentHP: 0, maxHP: 0, fainted: false, isMega: false, choiceMove: null, itemUsed: false, rankAtk: 0, rankSpA: 0 }
];

var streamerActiveIdx = 0;
var viewersActiveIdx = 0;
var streamerActionTab = 'moves'; // 'moves' or 'switch'

var pokeBattleState = {
  active: false,
  round: 1,
  phase: 'idle',
  streamerAction: null,
  viewersAction: null,
  streamerTimerInterval: null,
  streamerTimerRemaining: 30,
  streamerTimerTotal: 30,
  viewersTimerInterval: null,
  viewersTimerRemaining: 30,
  viewersTimerTotal: 30,
  faintTimerInterval: null,
  faintTimerRemaining: 15,
  faintTimerTotal: 15,
  stats: { totalRounds: 0, streamerDamage: 0, viewersDamage: 0, crits: 0, superEffective: 0 }
};

let pokeVoteUsers = new Map();
let pokeVoteCounts = {};
let faintVoteUsers = new Map();
let currentFaintTarget = null; // 'streamer' or 'viewers'

// --- ⚡ Dynamic Battle Speed & Instant Execution Engine ---
let pokeBattleSpeed = parseFloat(localStorage.getItem('poke_battle_speed') || '1.5');
window.pokeBattleSpeed = pokeBattleSpeed;

function setPokeBattleSpeed(speed) {
  pokeBattleSpeed = parseFloat(speed) || 1.5;
  window.pokeBattleSpeed = pokeBattleSpeed;
  try { localStorage.setItem('poke_battle_speed', pokeBattleSpeed.toString()); } catch(e) {}
  syncPokeBattleSpeedUI();
  showToast(`⚡ 배틀 진행 속도: ${pokeBattleSpeed}x 배속 설정 완료`, '⚡');
}

function syncPokeBattleSpeedUI() {
  ['1', '1_5', '2'].forEach(id => {
    const targetVal = id === '1_5' ? 1.5 : parseFloat(id);
    const isSelected = Math.abs(targetVal - pokeBattleSpeed) < 0.1;

    const btn = document.getElementById('speedBtn_' + id);
    if (btn) {
      if (isSelected) {
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #00ffa3, #0284c7)';
        btn.style.color = '#080c14';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-sub)';
      }
    }

    const dBtn = document.getElementById('drawerSpeedBtn_' + id);
    if (dBtn) {
      if (isSelected) {
        dBtn.classList.add('active');
        dBtn.style.background = 'linear-gradient(135deg, #00ffa3, #0284c7)';
        dBtn.style.color = '#080c14';
        dBtn.style.borderColor = 'transparent';
      } else {
        dBtn.classList.remove('active');
        dBtn.style.background = 'transparent';
        dBtn.style.color = 'var(--text-sub)';
        dBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      }
    }
  });
}

function battleSleep(baseMs) {
  const speed = (typeof pokeBattleSpeed === 'number' && pokeBattleSpeed > 0) ? pokeBattleSpeed : 1.5;
  return new Promise(resolve => setTimeout(resolve, Math.max(12, Math.round(baseMs / speed))));
}

function instantExecutePokeTurn() {
  if (!pokeBattleState.active) return;
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'viewers_vote') return;

  // If streamer hasn't chosen a move yet, choose first valid available move (or Struggle if no move is usable)
  if (!pokeBattleState.streamerAction) {
    const sSlot = streamerTeam[streamerActiveIdx];
    if (isSlotForcedStruggle(sSlot)) {
      handleStreamerStruggleSelect();
    } else if (sSlot && sSlot.pokemon && Array.isArray(sSlot.pokemon.moves)) {
      let targetIdx = 0;
      for (let i = 0; i < sSlot.pokemon.moves.length; i++) {
        const m = sSlot.pokemon.moves[i];
        const pp = sSlot.movesPP && sSlot.movesPP[i] ? sSlot.movesPP[i].currentPP : (m.pp || 15);
        const isLocked = sSlot.choiceMove && sSlot.choiceMove.name !== m.name;
        const isAV = sSlot.item === 'assault_vest' && m.category === '변화';
        if (pp > 0 && !isLocked && !isAV) {
          targetIdx = i;
          break;
        }
      }
      handleStreamerMoveSelect(targetIdx);
    }
  }
  clearInterval(pokeBattleState.turnTimerInterval);
  finishSimultaneousPokeTurn();
}

function switchMinigame(mode = 'pokebattle') {
  currentMinigame = 'pokebattle';
  const pokeBattleSection = document.getElementById('pokeBattleGameSection');
  if (pokeBattleSection) pokeBattleSection.style.display = 'flex';
  if (allPokemonData.length === 0) {
    loadPokemonDataset();
  } else {
    if (typeof renderPokeSetupPreview === 'function') renderPokeSetupPreview();
  }
}

async function loadPokemonDataset() {
  try {
    const res = await fetch('/pokemon_data.json');
    const data = await res.json();
    allPokemonData = data.pokemons || [];
    allPokemonItems = data.items || [];
    allMegaEvolutions = data.mega_evolutions || [];
    pokeTypeChart = data.type_chart || {};
  } catch (e) {
    console.warn('Failed to load pokemon_data.json', e);
  }

  if (allPokemonData.length > 0) {
    // Default team setups (Clean deep clones)
    const s0 = allPokemonData.find(p => p.id === 6) || allPokemonData[0];   // Charizard
    const s1 = allPokemonData.find(p => p.id === 94) || allPokemonData[1];  // Gengar
    const s2 = allPokemonData.find(p => p.id === 445) || allPokemonData[2]; // Garchomp
    streamerTeam[0].basePokeCode = s0.code || String(s0.id);
    streamerTeam[0].pokemon = JSON.parse(JSON.stringify(s0));
    streamerTeam[1].basePokeCode = s1.code || String(s1.id);
    streamerTeam[1].pokemon = JSON.parse(JSON.stringify(s1));
    streamerTeam[2].basePokeCode = s2.code || String(s2.id);
    streamerTeam[2].pokemon = JSON.parse(JSON.stringify(s2));

    const v0 = allPokemonData.find(p => p.id === 25) || allPokemonData[3];  // Pikachu
    const v1 = allPokemonData.find(p => p.id === 9) || allPokemonData[4];   // Blastoise
    const v2 = allPokemonData.find(p => p.id === 68) || allPokemonData[5];  // Machamp
    viewersTeam[0].basePokeCode = v0.code || String(v0.id);
    viewersTeam[0].pokemon = JSON.parse(JSON.stringify(v0));
    viewersTeam[1].basePokeCode = v1.code || String(v1.id);
    viewersTeam[1].pokemon = JSON.parse(JSON.stringify(v1));
    viewersTeam[2].basePokeCode = v2.code || String(v2.id);
    viewersTeam[2].pokemon = JSON.parse(JSON.stringify(v2));

    populateItemDropdowns();
    renderPokeSetupPreview();
    renderPokemonPickerFilters();
  }
}

function revertPokemonToBaseForm(slot) {
  if (!slot || !slot.pokemon) return;
  const targetCodeOrId = slot.basePokeCode || slot.pokemon.code || String(slot.pokemon.id);
  const base = allPokemonData.find(p => (p.code && p.code === targetCodeOrId) || String(p.id) === String(targetCodeOrId));
  if (base) {
    slot.pokemon = JSON.parse(JSON.stringify(base));
    slot.basePokeCode = base.code || String(base.id);
  }
  slot.isMega = false;
}

function getItemObj(itemId) {
  if (!itemId || itemId === 'none') {
    return { id: 'none', slug: 'none', name: '없음', emoji: '⚪', desc: '지닌 도구 없음', sprite: '' };
  }
  const found = allPokemonItems.find(x => x.id === itemId || x.slug === itemId);
  if (found) return found;
  return { id: itemId, slug: itemId, name: itemId, emoji: '🎒', desc: '', sprite: '' };
}

function getAvailableMegaEvolution(poke, itemId) {
  if (!poke || !allMegaEvolutions || allMegaEvolutions.length === 0) return null;
  const itemObj = getItemObj(itemId);
  const candidates = allMegaEvolutions.filter(m => m.basePokeId === poke.id);
  if (candidates.length === 0) return null;

  for (const c of candidates) {
    if (c.requiredStoneId && (c.requiredStoneId === itemObj.id || c.requiredStoneId === itemObj.slug)) {
      return c;
    }
    const stoneName = (itemObj.name || '').toLowerCase();
    const stoneSlug = (itemObj.slug || '').toLowerCase();
    if (itemObj.categoryKo === '메가돌' || stoneName.includes('나이트') || stoneName.includes('스톤') || stoneSlug.includes('ite')) {
      if (c.nameKo.includes('X') && (stoneName.includes('x') || stoneSlug.includes('-x'))) return c;
      if (c.nameKo.includes('Y') && (stoneName.includes('y') || stoneSlug.includes('-y'))) return c;
      if (!c.nameKo.includes('X') && !c.nameKo.includes('Y') && !stoneName.includes('x') && !stoneName.includes('y')) {
        const baseName = c.nameKo.replace('메가', '').replace(/[XY]/g, '');
        if (stoneName.includes(baseName)) return c;
      }
    }
  }

  if (poke.id === 384 && (itemObj.id.includes('rayquaza') || itemObj.name.includes('레쿠쟈'))) {
    return candidates[0];
  }
  return null;
}

function populateItemDropdowns() {
  const sSel = document.getElementById('streamerItemSelect');
  const vSel = document.getElementById('viewersItemSelect');
  const items = allPokemonItems.length > 0 ? allPokemonItems : [];

  if (items.length === 0) return;

  const competitiveIds = [
    'life-orb', 'focus-sash', 'leftovers', 'choice-scarf', 'choice-band', 'choice-specs',
    'assault-vest', 'sitrus-berry', 'lum-berry', 'expert-belt', 'rocky-helmet', 'eviolite',
    'scope-lens', 'kings-rock', 'black-sludge', 'big-root', 'white-herb', 'weakness-policy',
    'focus-band', 'covert-cloak', 'punching-glove', 'clear-amulet', 'booster-energy', 'loaded-dice',
    'heavy-duty-boots', 'safety-goggles', 'air-balloon', 'eject-button', 'red-card'
  ];

  const competitive = items.filter(it => competitiveIds.includes(it.id) || competitiveIds.includes(it.slug));
  const megaStones = items.filter(it => it.categoryKo === '메가돌' || it.name.includes('나이트') || it.name.includes('스톤'));
  const plates = items.filter(it => it.categoryKo === '플레이트' || it.categoryKo === '보석');
  const berries = items.filter(it => it.categoryKo === '위기상황' || it.name.includes('열매'));
  const others = items.filter(it => it.id !== 'none' && !competitive.includes(it) && !megaStones.includes(it) && !plates.includes(it) && !berries.includes(it));

  let html = `<option value="none">⚪ 없음 - 지닌 도구 없음</option>`;

  html += `<optgroup label="⭐ 추천 실전 배틀 도구">`;
  competitive.forEach(it => {
    html += `<option value="${it.id}">${it.emoji} ${it.name} - ${it.desc}</option>`;
  });
  html += `</optgroup>`;

  html += `<optgroup label="💎 메가스톤 (Mega Stones - 전용 메가진화)">`;
  megaStones.forEach(it => {
    html += `<option value="${it.id}">${it.emoji} ${it.name} - ${it.desc}</option>`;
  });
  html += `</optgroup>`;

  html += `<optgroup label="🔮 플레이트 & 주얼 (속성 강화)">`;
  plates.forEach(it => {
    html += `<option value="${it.id}">${it.emoji} ${it.name} - ${it.desc}</option>`;
  });
  html += `</optgroup>`;

  html += `<optgroup label="🍒 나무열매 & 위기 회복">`;
  berries.forEach(it => {
    html += `<option value="${it.id}">${it.emoji} ${it.name} - ${it.desc}</option>`;
  });
  html += `</optgroup>`;

  if (others.length > 0) {
    html += `<optgroup label="🎒 기타 도구">`;
    others.forEach(it => {
      html += `<option value="${it.id}">${it.emoji} ${it.name} - ${it.desc}</option>`;
    });
    html += `</optgroup>`;
  }

  if (sSel) sSel.innerHTML = html;
  if (vSel) vSel.innerHTML = html;
}

function handleBattleModeChange() {
  const sel = document.getElementById('pokeBattleModeSelect');
  if (sel) pokeBattleMode = sel.value;
  const drawerSelect = document.getElementById('drawerBattleModeSelect') || document.getElementById('drawerPokeBattleModeSelect');
  if (drawerSelect && drawerSelect.value !== pokeBattleMode) {
    drawerSelect.value = pokeBattleMode;
  }
  const sRow = document.getElementById('streamerSlotTabsRow');
  const vRow = document.getElementById('viewersSlotTabsRow');
  const banner = document.getElementById('pokeModeBannerText');

  if (pokeBattleMode === '1v1') {
    if (sRow) sRow.style.display = 'none';
    if (vRow) vRow.style.display = 'none';
    if (banner) banner.innerText = '1v1 에이스 진검승부';
    streamerSetupSlotIdx = 0;
    viewersSetupSlotIdx = 0;
  } else {
    if (sRow) sRow.style.display = 'flex';
    if (vRow) vRow.style.display = 'flex';
    if (banner) banner.innerText = '3v3 팀 엔트리 교체 배틀';
  }
  renderPokeSetupPreview();
  updateSettingsSummaryBadges();
}

function switchPokeSetupSlot(side, slotIdx) {
  if (side === 'streamer') {
    streamerSetupSlotIdx = slotIdx;
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`sSlotBtn${i}`);
      if (btn) btn.classList.toggle('active', i === slotIdx);
    }
  } else {
    viewersSetupSlotIdx = slotIdx;
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`vSlotBtn${i}`);
      if (btn) btn.classList.toggle('active', i === slotIdx);
    }
  }
  renderPokeSetupPreview();
}
function switchSetupSlot(side, slotIdx) {
  switchPokeSetupSlot(side, slotIdx);
}
window.switchSetupSlot = switchPokeSetupSlot;
window.switchPokeSetupSlot = switchPokeSetupSlot;

function handleItemChange(side, itemId) {
  const it = getItemObj(itemId);
  if (side === 'streamer') {
    streamerTeam[streamerSetupSlotIdx].item = itemId;
    if (it) showToast(`👑 ${getStreamerName()} ${streamerSetupSlotIdx+1}번 포켓몬 도구: [${it.emoji} ${it.name}]`, '🎒');
  } else {
    viewersTeam[viewersSetupSlotIdx].item = itemId;
    if (it) showToast(`👥 시청자 ${viewersSetupSlotIdx+1}번 포켓몬 도구: [${it.emoji} ${it.name}]`, '🎒');
  }
}

function renderPokeSetupPreview() {
  if (allPokemonData.length === 0) return;

  const sSlot = streamerTeam[streamerSetupSlotIdx];
  const vSlot = viewersTeam[viewersSetupSlotIdx];

  // Streamer Card
  if (sSlot && sSlot.pokemon) {
    const p = sSlot.pokemon;
    document.getElementById('streamerPokeNumber').innerText = `#${String(p.id).padStart(3, '0')}`;
    document.getElementById('streamerPokeSprite').src = p.sprite_front;
    document.getElementById('streamerPokeName').innerText = `${p.name} ${pokeBattleMode === '3v3' ? `(${streamerSetupSlotIdx+1}번)` : ''}`;
    document.getElementById('streamerPokeTypes').innerHTML = p.types.map(t => `<span class="type-badge type-${t}">${getTypeEmoji(t)} ${t}</span>`).join('');
    document.getElementById('streamerItemSelect').value = sSlot.item || 'none';

    const sHP = calculateLevel50HP(p.stats.hp);
    document.getElementById('streamerStatHP').innerText = sHP;
    document.getElementById('streamerStatAtk').innerText = p.stats.atk;
    document.getElementById('streamerStatDef').innerText = p.stats.def;
    document.getElementById('streamerStatSpA').innerText = p.stats.spa;
    document.getElementById('streamerStatSpD').innerText = p.stats.spd;
    document.getElementById('streamerStatSpe').innerText = p.stats.spe;

    document.getElementById('streamerPokeMovesPreview').innerHTML = p.moves.map((m, i) => `
      <div style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; text-align: left; font-size: 11px; border: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; color: #fff;">${i+1}. ${m.name}</span>
          <span class="type-badge type-${m.type}" style="font-size: 9px; padding: 1px 4px;">${m.type}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: var(--text-sub); font-size: 10px; margin-top: 2px;">
          <span>${m.category === '변화' ? '🛡️ 랭크업/상태' : `위력 ${m.power} / 명중 ${m.acc}%`}</span>
          <span style="color: #ffd700; font-weight: 800;">PP ${m.pp || 15}</span>
        </div>
      </div>
    `).join('');
  }

  // Viewers Card
  if (vSlot && vSlot.pokemon) {
    const p = vSlot.pokemon;
    document.getElementById('viewersPokeNumber').innerText = `#${String(p.id).padStart(3, '0')}`;
    document.getElementById('viewersPokeSprite').src = p.sprite_front;
    document.getElementById('viewersPokeName').innerText = `${p.name} ${pokeBattleMode === '3v3' ? `(${viewersSetupSlotIdx+1}번)` : ''}`;
    document.getElementById('viewersPokeTypes').innerHTML = p.types.map(t => `<span class="type-badge type-${t}">${getTypeEmoji(t)} ${t}</span>`).join('');
    document.getElementById('viewersItemSelect').value = vSlot.item || 'none';

    const vHP = calculateLevel50HP(p.stats.hp);
    document.getElementById('viewersStatHP').innerText = vHP;
    document.getElementById('viewersStatAtk').innerText = p.stats.atk;
    document.getElementById('viewersStatDef').innerText = p.stats.def;
    document.getElementById('viewersStatSpA').innerText = p.stats.spa;
    document.getElementById('viewersStatSpD').innerText = p.stats.spd;
    document.getElementById('viewersStatSpe').innerText = p.stats.spe;

    document.getElementById('viewersPokeMovesPreview').innerHTML = p.moves.map((m, i) => `
      <div style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; text-align: left; font-size: 11px; border: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; color: #fff;">${i+1}. ${m.name}</span>
          <span class="type-badge type-${m.type}" style="font-size: 9px; padding: 1px 4px;">${m.type}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: var(--text-sub); font-size: 10px; margin-top: 2px;">
          <span>${m.category === '변화' ? '🛡️ 랭크업/상태' : `위력 ${m.power} / 명중 ${m.acc}%`}</span>
          <span style="color: #ffd700; font-weight: 800;">PP ${m.pp || 15}</span>
        </div>
      </div>
    `).join('');
  }
}

function calculateLevel50HP(base) {
  return Math.floor(((2 * base + 31 + 10) * 50) / 100 + 50 + 10);
}

function calculateLevel50Stat(base) {
  return Math.floor(((2 * (base || 80) + 31 + 10) * 50) / 100 + 5);
}

function clampRank(stage) {
  return Math.max(-6, Math.min(6, stage || 0));
}

function getRankMultiplier(stage) {
  const s = clampRank(stage);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

function resetSlotBattleModifiers(slot) {
  if (!slot) return;
  slot.choiceMove = null;
  slot.rankAtk = 0;
  slot.rankDef = 0;
  slot.rankSpA = 0;
  slot.rankSpD = 0;
  slot.rankSpe = 0;
  slot.toxicCounter = 0;
  slot.destinyBond = false;
}

const EVIOLITE_ELIGIBLE_POKEMONS = new Set(['피카츄', '플라엣테', '침바루', '파오리', '마임맨']);

function getTypeEmoji(t) {
  const map = { "불꽃": "🔥", "물": "💧", "풀": "🌿", "전기": "⚡", "얼음": "❄️", "격투": "🥊", "독": "☠️", "땅": "🏜️", "비행": "🦅", "에스퍼": "🔮", "벌레": "🐛", "바위": "🪨", "고스트": "👻", "드래곤": "🐉", "악": "🌙", "강철": "⚙️", "페어리": "✨", "노말": "⚪" };
  return map[t] || "⚪";
}

// --- Pokemon Picker Modal (213 Pokemon Search & Filter) ---
function openPokemonPicker(target) {
  pokePickerTarget = target;
  pokePickerSlotIdx = target === 'streamer' ? streamerSetupSlotIdx : viewersSetupSlotIdx;
  const modal = document.getElementById('pokemonPickerModal');
  const label = document.getElementById('pokemonPickerTargetLabel');
  if (label) {
    label.innerText = target === 'streamer' 
      ? `👑 ${getStreamerName()} [${pokeBattleMode === '3v3' ? `${pokePickerSlotIdx+1}번 포켓몬` : '에이스'}]을 선택하세요`
      : `👥 시청자 연합 [${pokeBattleMode === '3v3' ? `${pokePickerSlotIdx+1}번 포켓몬` : '에이스'}]을 선택하세요`;
  }
  renderPokemonPickerFilters();
  filterPokemonGrid();
  if (modal) modal.classList.add('active');
}

function closePokemonPickerModal() {
  const modal = document.getElementById('pokemonPickerModal');
  if (modal) modal.classList.remove('active');
}

function renderPokemonPickerFilters() {
  const container = document.getElementById('pokeTypeFilterContainer');
  if (!container) return;
  const types = ['all', '노말', '불꽃', '물', '풀', '전기', '얼음', '격투', '독', '땅', '비행', '에스퍼', '벌레', '바위', '고스트', '드래곤', '악', '강철', '페어리'];
  
  container.innerHTML = types.map(t => `
    <button type="button" class="filter-chip-btn ${currentPokeTypeFilter === t ? 'active' : ''}" style="white-space: nowrap; padding: 4px 10px; font-size: 11px;" onclick="setPokeTypeFilter('${t}')">
      <span>${t === 'all' ? '🌈 전체' : `${getTypeEmoji(t)} ${t}`}</span>
    </button>
  `).join('');
}

function setPokeTypeFilter(type) {
  currentPokeTypeFilter = type;
  renderPokemonPickerFilters();
  filterPokemonGrid();
}

function resetPokemonPickerFilters() {
  const searchInput = document.getElementById('pokeSearchInput');
  if (searchInput) searchInput.value = '';
  currentPokeTypeFilter = 'all';
  renderPokemonPickerFilters();
  filterPokemonGrid();
}

function filterPokemonGrid() {
  const grid = document.getElementById('pokeGridContainer');
  const searchInput = document.getElementById('pokeSearchInput');
  if (!grid) return;

  const q = (searchInput ? searchInput.value : '').trim().toLowerCase();

  const filtered = allPokemonData.filter(p => {
    const matchesType = (currentPokeTypeFilter === 'all' || p.types.includes(currentPokeTypeFilter));
    const matchesQuery = (!q || p.name.toLowerCase().includes(q) || String(p.id).includes(q) || p.code.toLowerCase().includes(q));
    return matchesType && matchesQuery;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-sub); padding: 40px 0; font-size: 13px;">일치하는 포켓몬이 없습니다.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const hasMega = allMegaEvolutions.some(m => m.basePokeId === p.id);
    return `
      <div class="poke-grid-item" onclick="selectPokemonFromPicker('${p.code || p.id}')">
        <div style="position: relative; width: 72px; height: 72px; margin: 0 auto;">
          <img src="${p.sprite_front}" alt="${p.name}" style="width: 72px; height: 72px; object-fit: contain; image-rendering: pixelated;" onerror="this.src='pokemon/25.png'">
          ${hasMega ? '<span class="mega-tag-badge" style="position: absolute; bottom: 0; right: -4px; font-size: 9px;">🧬 MEGA</span>' : ''}
        </div>
        <div style="font-size: 10px; color: var(--text-sub); margin-top: 2px;">#${String(p.id).padStart(3, '0')}</div>
        <div style="font-size: 13px; font-weight: 800; color: #fff; margin: 2px 0 4px;">${p.name}</div>
        <div style="display: flex; gap: 3px; flex-wrap: wrap; justify-content: center;">
          ${p.types.map(t => `<span class="type-badge type-${t}" style="font-size: 8px; padding: 1px 4px;">${t}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function selectPokemonFromPicker(pokeCodeOrId) {
  const found = allPokemonData.find(p => (p.code && p.code === pokeCodeOrId) || String(p.id) === String(pokeCodeOrId));
  if (!found) return;

  const team = pokePickerTarget === 'streamer' ? streamerTeam : viewersTeam;
  team[pokePickerSlotIdx].basePokeCode = found.code || String(found.id);
  team[pokePickerSlotIdx].pokemon = JSON.parse(JSON.stringify(found));
  team[pokePickerSlotIdx].isMega = false;

  // Auto-suggest Mega Stone if available
  const megaForm = allMegaEvolutions.find(m => m.basePokeId === found.id);
  if (megaForm && megaForm.requiredStoneId) {
    team[pokePickerSlotIdx].item = megaForm.requiredStoneId;
  }

  if (pokePickerTarget === 'streamer') {
    showToast(`👑 ${getStreamerName()} [${found.name}] 선택 완료! ${megaForm ? `(💎 ${getItemObj(team[pokePickerSlotIdx].item).name} 자동 장착)` : ''}`, '🔥');
  } else {
    showToast(`👥 시청자 [${found.name}] 선택 완료! ${megaForm ? `(💎 ${getItemObj(team[pokePickerSlotIdx].item).name} 자동 장착)` : ''}`, '⚡');
  }
  renderPokeSetupPreview();
  closePokemonPickerModal();
}

function randomizeSlotItem(side) {
  const team = side === 'streamer' ? streamerTeam : viewersTeam;
  const currentSlot = team[side === 'streamer' ? streamerSetupSlotIdx : viewersSetupSlotIdx];
  const poke = currentSlot.pokemon;
  const megaForm = poke ? allMegaEvolutions.find(m => m.basePokeId === poke.id) : null;

  // 40% chance to equip matching Mega Stone if pokemon can mega evolve
  if (megaForm && megaForm.requiredStoneId && Math.random() < 0.45) {
    currentSlot.item = megaForm.requiredStoneId;
  } else {
    const itemPool = allPokemonItems.filter(x => x.id !== 'none');
    const randItem = itemPool[Math.floor(Math.random() * itemPool.length)];
    currentSlot.item = randItem.id;
  }

  const itemObj = getItemObj(currentSlot.item);
  const sel = document.getElementById(side === 'streamer' ? 'streamerItemSelect' : 'viewersItemSelect');
  if (sel) sel.value = currentSlot.item;

  showToast(`${side === 'streamer' ? `👑 ${getStreamerName()}` : '👥 시청자'} 도구: [${itemObj.emoji} ${itemObj.name}] 배정!`, '🎒');
}

function randomizeCurrentSlot(target) {
  if (allPokemonData.length === 0) return;
  const rand = allPokemonData[Math.floor(Math.random() * allPokemonData.length)];
  const team = target === 'streamer' ? streamerTeam : viewersTeam;
  const slotIdx = target === 'streamer' ? streamerSetupSlotIdx : viewersSetupSlotIdx;

  team[slotIdx].basePokeCode = rand.code || String(rand.id);
  team[slotIdx].pokemon = JSON.parse(JSON.stringify(rand));
  team[slotIdx].isMega = false;
  randomizeSlotItem(target);

  showToast(`${target === 'streamer' ? `👑 ${getStreamerName()}` : '👥 시청자'} ${slotIdx+1}번: [${rand.name}] 랜덤 배정!`, '🎲');
  renderPokeSetupPreview();
}

function randomizeAllTeams() {
  if (allPokemonData.length < 6) return;
  const shuffled = [...allPokemonData].sort(() => 0.5 - Math.random());

  for (let i = 0; i < 3; i++) {
    streamerTeam[i].basePokeCode = shuffled[i].code || String(shuffled[i].id);
    streamerTeam[i].pokemon = JSON.parse(JSON.stringify(shuffled[i]));
    streamerTeam[i].isMega = false;
    const sMega = allMegaEvolutions.find(m => m.basePokeId === shuffled[i].id);
    if (sMega && sMega.requiredStoneId && Math.random() < 0.5) {
      streamerTeam[i].item = sMega.requiredStoneId;
    } else {
      const randIt = allPokemonItems[Math.floor(Math.random() * allPokemonItems.length)];
      streamerTeam[i].item = randIt.id;
    }

    viewersTeam[i].basePokeCode = shuffled[i + 3].code || String(shuffled[i + 3].id);
    viewersTeam[i].pokemon = JSON.parse(JSON.stringify(shuffled[i + 3]));
    viewersTeam[i].isMega = false;
    const vMega = allMegaEvolutions.find(m => m.basePokeId === shuffled[i + 3].id);
    if (vMega && vMega.requiredStoneId && Math.random() < 0.5) {
      viewersTeam[i].item = vMega.requiredStoneId;
    } else {
      const randIt = allPokemonItems[Math.floor(Math.random() * allPokemonItems.length)];
      viewersTeam[i].item = randIt.id;
    }
  }

  showToast('🎲 양팀 포켓몬 및 도구(메가스톤 포함)가 무작위로 구성되었습니다!', '✨');
  renderPokeSetupPreview();
}

// --- Battle Arena Execution Engine ---
function startPokeBattle() {
  const sel = document.getElementById('pokeBattleModeSelect');
  if (sel) pokeBattleMode = sel.value;
  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;

  if (pokeBattleMode === '1v1') {
    streamerActiveIdx = 0;
    viewersActiveIdx = 0;
  }

  for (let i = 0; i < teamSize; i++) {
    if (!streamerTeam[i].pokemon || !viewersTeam[i].pokemon) {
      showToast('포켓몬 엔트리가 완성되지 않았습니다.', '⚠️');
      return;
    }

    // Always revert to clean base form before battle starts
    revertPokemonToBaseForm(streamerTeam[i]);
    revertPokemonToBaseForm(viewersTeam[i]);

    const sP = streamerTeam[i].pokemon;
    streamerTeam[i].maxHP = calculateLevel50HP(sP.stats.hp);
    streamerTeam[i].currentHP = streamerTeam[i].maxHP;
    streamerTeam[i].fainted = false;
    streamerTeam[i].isMega = false;
    resetSlotBattleModifiers(streamerTeam[i]);
    streamerTeam[i].itemUsed = false;
    streamerTeam[i].gemUsed = false;
    streamerTeam[i].status = null;

    streamerTeam[i].movesPP = sP.moves.map(m => ({
      name: m.name,
      currentPP: (m.pp !== undefined ? m.pp : (m.max_pp || 15)),
      maxPP: (m.pp !== undefined ? m.pp : (m.max_pp || 15))
    }));

    const vP = viewersTeam[i].pokemon;
    viewersTeam[i].maxHP = calculateLevel50HP(vP.stats.hp);
    viewersTeam[i].currentHP = viewersTeam[i].maxHP;
    viewersTeam[i].fainted = false;
    viewersTeam[i].isMega = false;
    resetSlotBattleModifiers(viewersTeam[i]);
    viewersTeam[i].itemUsed = false;
    viewersTeam[i].gemUsed = false;
    viewersTeam[i].status = null;
    viewersTeam[i].movesPP = vP.moves.map(m => ({
      name: m.name,
      currentPP: (m.pp !== undefined ? m.pp : (m.max_pp || 15)),
      maxPP: (m.pp !== undefined ? m.pp : (m.max_pp || 15))
    }));
  }

  // Reset arena sprites & animations
  const sSpr = document.getElementById('arenaStreamerSprite');
  if (sSpr) {
    sSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    sSpr.style.opacity = '1';
    sSpr.style.transform = 'none';
    sSpr.style.filter = 'none';
  }
  const vSpr = document.getElementById('arenaViewersSprite');
  if (vSpr) {
    vSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    vSpr.style.opacity = '1';
    vSpr.style.transform = 'none';
    vSpr.style.filter = 'none';
  }

  streamerActiveIdx = 0;
  viewersActiveIdx = 0;
  streamerActionTab = 'moves';
  streamerTeamHasMegaEvolved = false;
  viewersTeamHasMegaEvolved = false;
  streamerMegaSelected = false;

  pokeBattleState.active = true;
  pokeBattleState.round = 1;
  pokeBattleState.stealthRockStreamer = false;
  pokeBattleState.stealthRockViewers = false;
  lastDoubleKoWinner = null;
  pokeBattleState.phase = 'streamer_turn';
  pokeBattleState.streamerAction = null;
  pokeBattleState.viewersAction = null;
  pokeBattleState.stats = { totalRounds: 0, streamerDamage: 0, viewersDamage: 0, crits: 0, superEffective: 0 };

  document.getElementById('pokeBattleSetupStage').style.display = 'none';
  document.getElementById('pokeBattleArenaStage').style.display = 'flex';

  updateArenaActivePokemonUI();
  renderArenaTeamBallsHUD();
  updateArenaHPBars();
  if (window.pokeSoundEngine) {
    window.pokeSoundEngine.playBgm('normal', 500);
  }
  startStreamerPokeTurn();
}

function updateArenaActivePokemonUI() {
  const sSlot = streamerTeam[streamerActiveIdx];
  const vSlot = viewersTeam[viewersActiveIdx];
  const sP = sSlot.pokemon;
  const vP = vSlot.pokemon;

  const sNameEl = document.getElementById('arenaStreamerName');
  if (sNameEl) {
    sNameEl.innerHTML = sSlot.isMega ? `<span class="mega-tag-badge">🧬 MEGA</span> ${sP.name}` : sP.name;
  }
  const sSpr = document.getElementById('arenaStreamerSprite');
  if (sSpr) {
    sSpr.src = sP.sprite_back || sP.sprite_front;
    sSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    sSpr.style.opacity = '1';
    sSpr.style.transform = 'none';
  }
  document.getElementById('arenaStreamerTypes').innerHTML = sP.types.map(t => `<span class="type-badge type-${t}" style="font-size: 9px; padding: 1px 4px;">${t}</span>`).join('');
  
  const sItem = getItemObj(sSlot.item);
  const sItemBadge = document.getElementById('arenaStreamerItemBadge');
  if (sItemBadge) {
    sItemBadge.innerHTML = sSlot.isMega ? `<span class="mega-tag-badge">🧬 MEGA</span> ${sItem.name}` : `${sItem.emoji} ${sItem.name}`;
    sItemBadge.style.display = sSlot.item === 'none' ? 'none' : 'inline-flex';
  }

  const vNameEl = document.getElementById('arenaViewersName');
  if (vNameEl) {
    vNameEl.innerHTML = vSlot.isMega ? `<span class="mega-tag-badge">🧬 MEGA</span> ${vP.name}` : vP.name;
  }
  const vSpr = document.getElementById('arenaViewersSprite');
  if (vSpr) {
    vSpr.src = vP.sprite_front;
    vSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    vSpr.style.opacity = '1';
    vSpr.style.transform = 'none';
  }
  document.getElementById('arenaViewersTypes').innerHTML = vP.types.map(t => `<span class="type-badge type-${t}" style="font-size: 9px; padding: 1px 4px;">${t}</span>`).join('');

  updateArenaBattleBadges();
}

function renderArenaSideItemBadge(side) {
  const isStreamer = side === 'streamer';
  const slot = isStreamer ? streamerTeam[streamerActiveIdx] : viewersTeam[viewersActiveIdx];
  const badgeEl = document.getElementById(isStreamer ? 'arenaStreamerItemBadge' : 'arenaViewersItemBadge');
  if (!badgeEl || !slot) return;
  if (!slot.item || slot.item === 'none') {
    badgeEl.style.display = 'none';
    return;
  }
  const itemObj = getItemObj(slot.item);
  const consumedTag = slot.itemUsed ? ' <span style="opacity: 0.72; font-size: 9px;">(소모됨)</span>' : '';
  badgeEl.innerHTML = slot.isMega
    ? `<span class="mega-tag-badge">🧬 MEGA</span> ${escapeHtml(itemObj.name)}`
    : `${itemObj.emoji} ${escapeHtml(itemObj.name)}${consumedTag}`;
  badgeEl.style.opacity = slot.itemUsed ? '0.6' : '1';
  badgeEl.style.display = 'inline-flex';
}

function updateArenaBattleBadges() {
  const rankLabels = [
    ['rankAtk', '공'],
    ['rankDef', '방'],
    ['rankSpA', '특공'],
    ['rankSpD', '특방'],
    ['rankSpe', '스핏']
  ];
  const statusMap = {
    brn: { cls: 'poke-status-brn', label: '🔥 화상' },
    par: { cls: 'poke-status-par', label: '⚡ 마비' },
    tox: { cls: 'poke-status-tox', label: '☠️ 맹독' }
  };

  ['streamer', 'viewers'].forEach(side => {
    renderArenaSideItemBadge(side);
    const isStreamer = side === 'streamer';
    const slot = isStreamer ? streamerTeam[streamerActiveIdx] : viewersTeam[viewersActiveIdx];
    const hasRock = isStreamer ? pokeBattleState.stealthRockStreamer : pokeBattleState.stealthRockViewers;
    const container = document.getElementById(isStreamer ? 'arenaStreamerBattleBadges' : 'arenaViewersBattleBadges');
    if (!container) return;

    const pills = [];
    if (slot && slot.status && statusMap[slot.status]) {
      const st = statusMap[slot.status];
      pills.push(`<span class="poke-status-pill ${st.cls}">${st.label}</span>`);
    }
    if (slot) {
      rankLabels.forEach(([key, label]) => {
        const val = slot[key] || 0;
        if (val > 0) pills.push(`<span class="poke-rank-pill poke-rank-pos">${label} +${val}</span>`);
        else if (val < 0) pills.push(`<span class="poke-rank-pill poke-rank-neg">${label} ${val}</span>`);
      });
      if (slot.destinyBond) {
        pills.push(`<span class="poke-status-pill poke-status-dbond">👻 길동무</span>`);
      }
    }
    if (hasRock) {
      pills.push(`<span class="poke-status-pill poke-status-rock">🪨 스텔스록</span>`);
    }
    container.innerHTML = pills.join('');
  });
}

function renderArenaTeamBallsHUD() {
  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const sHUD = document.getElementById('arenaStreamerBallsHUD');
  const vHUD = document.getElementById('arenaViewersBallsHUD');

  if (sHUD) {
    sHUD.innerHTML = Array.from({length: teamSize}).map((_, i) => {
      const slot = streamerTeam[i];
      const isAct = i === streamerActiveIdx;
      const isFaint = slot ? slot.fainted : false;
      const pName = (slot && slot.pokemon && slot.pokemon.name) || '포켓몬';
      const cls = isFaint ? 'poke-ball-fainted' : (isAct ? 'poke-ball-active' : 'poke-ball-alive');
      return `<span class="poke-ball-indicator ${cls}" title="${pName} (${isFaint ? '기절' : isAct ? '출전중' : '생존'})">${isFaint ? '✕' : isAct ? '⚔️' : '●'}</span>`;
    }).join('');
  }

  if (vHUD) {
    vHUD.innerHTML = Array.from({length: teamSize}).map((_, i) => {
      const slot = viewersTeam[i];
      const isAct = i === viewersActiveIdx;
      const isFaint = slot ? slot.fainted : false;
      const pName = (slot && slot.pokemon && slot.pokemon.name) || '포켓몬';
      const cls = isFaint ? 'poke-ball-fainted' : (isAct ? 'poke-ball-active' : 'poke-ball-alive');
      return `<span class="poke-ball-indicator ${cls}" title="${pName} (${isFaint ? '기절' : isAct ? '출전중' : '생존'})">${isFaint ? '✕' : isAct ? '⚔️' : '●'}</span>`;
    }).join('');
  }
}

function updateArenaHPBars() {
  const sSlot = streamerTeam[streamerActiveIdx];
  const vSlot = viewersTeam[viewersActiveIdx];

  const sPct = Math.max(0, (sSlot.currentHP / sSlot.maxHP) * 100);
  const vPct = Math.max(0, (vSlot.currentHP / vSlot.maxHP) * 100);

  const sBar = document.getElementById('arenaStreamerHPBar');
  const vBar = document.getElementById('arenaViewersHPBar');
  const sText = document.getElementById('arenaStreamerHPText');
  const vText = document.getElementById('arenaViewersHPText');

  if (sBar) {
    sBar.style.width = `${sPct}%`;
    sBar.style.background = sPct > 50 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : sPct > 20 ? 'linear-gradient(90deg, #eab308, #facc15)' : 'linear-gradient(90deg, #ef4444, #f87171)';
  }
  if (vBar) {
    vBar.style.width = `${vPct}%`;
    vBar.style.background = vPct > 50 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : vPct > 20 ? 'linear-gradient(90deg, #eab308, #facc15)' : 'linear-gradient(90deg, #ef4444, #f87171)';
  }

  if (sText) sText.innerText = `${Math.max(0, Math.round(sSlot.currentHP))} / ${sSlot.maxHP}`;
  if (vText) vText.innerText = `${Math.max(0, Math.round(vSlot.currentHP))} / ${vSlot.maxHP}`;
  updateArenaBattleBadges();
  updateStreamerControllerPopout();

  // 🚨 Pokemon Gen 4/5 Dynamic Low HP Pinch BGM Evaluator
  // 시청자든 스트리머든 1마리만 남았을 때(1대1 포함) 빨간피(HP <= 20%)인 경우 긴박한 위기 BGM 즉시 발동
  if (pokeBattleState.active && window.pokeSoundEngine) {
    const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
    let streamerAliveCount = 0;
    for (let i = 0; i < teamSize; i++) {
      if (streamerTeam[i] && !streamerTeam[i].fainted && streamerTeam[i].currentHP > 0) {
        streamerAliveCount++;
      }
    }
    let viewersAliveCount = 0;
    for (let i = 0; i < teamSize; i++) {
      if (viewersTeam[i] && !viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) {
        viewersAliveCount++;
      }
    }
    window.pokeSoundEngine.evaluatePinchCondition(
      streamerAliveCount,
      sSlot ? sSlot.currentHP : 0,
      sSlot ? sSlot.maxHP : 1,
      viewersAliveCount,
      vSlot ? vSlot.currentHP : 0,
      vSlot ? vSlot.maxHP : 1
    );
  }
}

function setBattleDialogue(html) {
  const dlg = document.getElementById('arenaDialogueText');
  if (dlg) dlg.innerHTML = html;
}

function switchPokeActionTab(tab) {
  if (pokeBattleMode === '1v1') {
    tab = 'moves';
  }
  streamerActionTab = tab;
  const movesBtn = document.getElementById('pokeActionMovesTabBtn');
  const switchBtn = document.getElementById('pokeActionSwitchTabBtn');
  const movesDeck = document.getElementById('arenaMoveButtonsDeck');
  const switchDeck = document.getElementById('arenaSwitchButtonsDeck');
  const megaContainer = document.getElementById('streamerMegaToggleContainer');
  const blindDeck = document.getElementById('streamerPrivacyBlindDeck');

  if (switchBtn) {
    switchBtn.style.display = pokeBattleMode === '1v1' ? 'none' : 'inline-flex';
  }

  if (streamerPrivacyBlind) {
    if (blindDeck) blindDeck.style.display = 'block';
    if (movesDeck) movesDeck.style.display = 'none';
    if (switchDeck) switchDeck.style.display = 'none';
    if (megaContainer) megaContainer.style.display = 'none';
    if (tab === 'moves') {
      if (movesBtn) movesBtn.classList.add('active');
      if (switchBtn) switchBtn.classList.remove('active');
    } else {
      if (switchBtn) switchBtn.classList.add('active');
      if (movesBtn) movesBtn.classList.remove('active');
      renderStreamerSwitchDeck();
    }
    return;
  }

  if (blindDeck) blindDeck.style.display = 'none';

  if (tab === 'moves') {
    if (movesBtn) movesBtn.classList.add('active');
    if (switchBtn) switchBtn.classList.remove('active');
    if (movesDeck) movesDeck.style.display = 'grid';
    if (switchDeck) switchDeck.style.display = 'none';
    
    const sSlot = streamerTeam[streamerActiveIdx];
    const megaForm = getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);
    if (megaContainer) {
      megaContainer.style.display = (megaForm && !streamerTeamHasMegaEvolved && !sSlot.isMega) ? 'block' : 'none';
    }
  } else {
    if (switchBtn) switchBtn.classList.add('active');
    if (movesBtn) movesBtn.classList.remove('active');
    if (movesDeck) movesDeck.style.display = 'none';
    if (switchDeck) switchDeck.style.display = 'flex';
    if (megaContainer) megaContainer.style.display = 'none';
    renderStreamerSwitchDeck();
  }
}

function renderStreamerSwitchDeck() {
  const container = document.getElementById('arenaSwitchButtonsDeck');
  if (!container) return;

  if (pokeBattleMode === '1v1') {
    container.innerHTML = '<div style="color: var(--text-sub); text-align: center; padding: 20px; font-size: 12px;">1v1 에이스 배틀은 교체가 지원되지 않습니다.</div>';
    return;
  }

  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const candidates = [];
  for (let i = 0; i < teamSize; i++) {
    if (i !== streamerActiveIdx && streamerTeam[i] && streamerTeam[i].pokemon) {
      candidates.push({ idx: i, slot: streamerTeam[i] });
    }
  }

  if (candidates.length === 0) {
    container.innerHTML = '<div style="color: var(--text-sub); text-align: center; padding: 20px; font-size: 12px;">교체 가능한 팀원 포켓몬이 없습니다.</div>';
    return;
  }

  container.innerHTML = candidates.map((c, sIdx) => {
    if (!c.slot || !c.slot.pokemon) return '';
    const p = c.slot.pokemon;
    const it = getItemObj(c.slot.item);
    const maxHP = c.slot.maxHP || 1;
    const curHP = Math.max(0, c.slot.currentHP || 0);
    const hpPct = Math.round((curHP / maxHP) * 100);
    const isFainted = c.slot.fainted || curHP <= 0;
    const isSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'switch' && pokeBattleState.streamerAction.targetIdx === c.idx;
    const shortcutNum = sIdx + 1;
    const spriteSrc = p.sprite_front || (p.sprites && p.sprites.front) || 'favicon.png';
    const typesList = Array.isArray(p.types) ? p.types : [];
    return `
      <div class="poke-switch-card ${isFainted ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" onclick="${isFainted ? '' : `handleStreamerSwitchSelect(${c.idx})`}">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${spriteSrc}" alt="${p.name || ''}" style="width: 38px; height: 38px; object-fit: contain; image-rendering: pixelated;">
          <div>
            <div style="font-weight: 800; color: ${isSelected ? '#38bdf8' : '#fff'}; font-size: 13px;">
              <kbd style="background: rgba(56,189,248,0.2); border: 1px solid rgba(56,189,248,0.4); border-radius: 4px; padding: 1px 5px; font-size: 10px; margin-right: 4px; font-family: monospace; color: #38bdf8;">${shortcutNum}</kbd>
              ${c.idx + 1}번. ${p.name || '포켓몬'} ${isSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; font-weight: normal; margin-left: 2px;">(다시 클릭 시 취소)</span>' : ''}
            </div>
            <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
              ${typesList.map(t => `<span class="type-badge type-${t}" style="font-size: 8px; padding: 1px 4px;">${t}</span>`).join('')}
              <span class="poke-item-badge" style="font-size: 9px; padding: 1px 6px;">${it.emoji} ${it.name}</span>
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; font-weight: 800; color: ${isFainted ? '#ef4444' : '#4ade80'};">${isFainted ? '💀 기절' : `HP ${curHP}/${maxHP} (${hpPct}%)`}</div>
          ${isFainted ? '' : `<span class="badge-tag" style="background: rgba(0,255,163,0.2); color: ${isSelected ? '#38bdf8' : 'var(--chzzk-green)'}; font-size: 10px; margin-top: 2px;">${isSelected ? '선택됨' : '🔄 교체 출전'}</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function toggleStreamerMega() {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;
  const sSlot = streamerTeam[streamerActiveIdx];
  const megaForm = getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);
  if (!megaForm || streamerTeamHasMegaEvolved || sSlot.isMega) {
    showToast('현재 출전 포켓몬은 메가진화할 수 없거나 이미 이번 매치에서 메가진화를 사용했습니다.', '⚠️');
    return;
  }

  streamerMegaSelected = !streamerMegaSelected;
  const btn = document.getElementById('streamerMegaToggleBtn');
  const pill = document.getElementById('streamerMegaPill');
  if (btn) btn.classList.toggle('active', streamerMegaSelected);
  if (pill) {
    pill.className = `mega-pill-badge ${streamerMegaSelected ? 'on' : 'off'}`;
    pill.innerText = streamerMegaSelected ? '🧬 MEGA ON' : 'OFF';
  }

  if (pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'move') {
    pokeBattleState.streamerAction.isMega = streamerMegaSelected;
    updateStreamerActionStatusUI(false);
  }

  renderStreamerMovesDeck();

  if (streamerMegaSelected) {
    showToast(`🧬 [메가진화] 장전 완료! 기술 선택 시 메가진화와 동시에 공격합니다.`, '✨');
  } else {
    showToast('메가진화가 취소되었습니다.', '⚪');
  }

  updateStreamerControllerPopout();
}

function updateStreamerActionStatusUI(isReveal = false) {
  const badge = document.getElementById('streamerActionStatusBadge');
  if (!badge) return;

  if (!pokeBattleState.streamerAction) {
    badge.innerHTML = `👑 <b>${escapeHtml(getStreamerName())}</b>: 행동 선택 대기 중...`;
    badge.style.color = '#ffd700';
    badge.style.background = 'rgba(255, 215, 0, 0.1)';
    badge.style.borderColor = 'rgba(255, 215, 0, 0.4)';
  } else {
    if (isReveal) {
      if (pokeBattleState.streamerAction.type === 'move') {
        const m = pokeBattleState.streamerAction.move;
        const isMega = pokeBattleState.streamerAction.isMega;
        badge.innerHTML = `👑 <b>${escapeHtml(getStreamerName())} 최종 선택</b>: [${isMega ? '🧬 MEGA ' : ''}${m.name}]! <span style="font-size: 10px; color: #4ade80;">(발동)</span>`;
        badge.style.color = '#00ffa3';
        badge.style.background = 'rgba(0, 255, 163, 0.2)';
        badge.style.borderColor = '#00ffa3';
      } else if (pokeBattleState.streamerAction.type === 'switch') {
        const tp = pokeBattleState.streamerAction.targetPokemon;
        badge.innerHTML = `👑 <b>${escapeHtml(getStreamerName())} 최종 교체</b>: [${tp.name}]! <span style="font-size: 10px; color: #38bdf8;">(발동)</span>`;
        badge.style.color = '#38bdf8';
        badge.style.background = 'rgba(56, 189, 248, 0.2)';
        badge.style.borderColor = '#38bdf8';
      }
    } else {
      // Option B: Information Blind mode during selection
      badge.innerHTML = `👑 <b>${escapeHtml(getStreamerName())}</b>: 행동 결정 완료! 🔒 <span style="font-size: 10px; color: #4ade80;">(종료 시 동시 공개)</span>`;
      badge.style.color = '#00ffa3';
      badge.style.background = 'rgba(0, 255, 163, 0.12)';
      badge.style.borderColor = 'rgba(0, 255, 163, 0.5)';
    }
  }
  updateStreamerControllerPopout();
}

// --- Simultaneous Turn Selection Engine ---
function startSimultaneousPokeTurn() {
  pokeBattleState.phase = 'simultaneous_turn';
  pokeBattleState.streamerAction = null;
  pokeBattleState.viewersAction = null;
  streamerMegaSelected = false;

  pokeVoteUsers.clear();
  pokeVoteCounts = {};

  const roundBadge = document.getElementById('pokeBattleRoundBadge');
  if (roundBadge) roundBadge.innerText = `⚔️ ROUND ${pokeBattleState.round}`;

  const phaseBadge = document.getElementById('pokeBattlePhaseBadge');
  if (phaseBadge) {
    phaseBadge.innerText = '⚔️ 턴 행동 동시 선택 중';
    phaseBadge.style.background = 'linear-gradient(135deg, #6366f1, #00ffa3)';
  }

  setBattleDialogue(`⚔️ <b>Round ${pokeBattleState.round}</b>: 스트리머와 시청자가 행동을 동시에 선택합니다!`);

  updateStreamerActionStatusUI();

  // Setup Streamer Right Deck
  if (streamerPrivacyBlind) {
    const blindDeck = document.getElementById('streamerPrivacyBlindDeck');
    if (blindDeck) blindDeck.style.display = 'block';
    const tabsBar = document.getElementById('streamerActionTabsBar');
    if (tabsBar) tabsBar.style.display = 'none';
    const megaContainer = document.getElementById('streamerMegaToggleContainer');
    if (megaContainer) megaContainer.style.display = 'none';
    const movesDeck = document.getElementById('arenaMoveButtonsDeck');
    if (movesDeck) movesDeck.style.display = 'none';
    const switchDeck = document.getElementById('arenaSwitchButtonsDeck');
    if (switchDeck) switchDeck.style.display = 'none';
  } else {
    switchPokeActionTab('moves');
  }
  renderStreamerMovesDeck();
  renderStreamerSwitchDeck();
  updateStreamerControllerPopout();

  // Setup Viewers Left Deck
  const hud = document.getElementById('arenaViewersVoteHud');
  if (hud) hud.style.display = 'block';

  const vSlot = viewersTeam[viewersActiveIdx];
  const vMega = getAvailableMegaEvolution(vSlot.pokemon, vSlot.item);
  const canMega = vMega && !viewersTeamHasMegaEvolved && !vSlot.isMega;

  const switchGuides = [];
  let switchCounter = 5;
  if (pokeBattleMode === '3v3') {
    for (let i = 0; i < 3; i++) {
      if (i !== viewersActiveIdx && !viewersTeam[i].fainted) {
        switchGuides.push(`[<b>${switchCounter}</b>: ${i+1}번 ${viewersTeam[i].pokemon.name}]`);
        switchCounter++;
      }
    }
  }

  const instr = document.getElementById('arenaVoteInstructionText');
  if (instr) {
    if (pokeBattleMode === '1v1') {
      instr.innerHTML = canMega
        ? `(채팅: <b>1</b>~<b>4</b> / <b>메가1</b>~<b>메가4</b>)`
        : `(채팅에 <b>1</b>~<b>4</b> 기술 입력)`;
    } else {
      instr.innerHTML = canMega
        ? (switchGuides.length > 0 ? `(채팅: <b>1</b>~<b>4</b> / <b>메가1</b>~<b>메가4</b> / <b>5</b>, <b>6</b> 교체)` : `(채팅: <b>1</b>~<b>4</b> / <b>메가1</b>~<b>메가4</b>)`)
        : (switchGuides.length > 0 ? `(채팅에 <b>1</b>~<b>4</b> 기술 / <b>5</b>, <b>6</b> 교체)` : `(채팅에 <b>1</b>~<b>4</b> 기술 입력)`);
    }
  }

  renderPokeVotingBarsUI();

  // Unified Single Turn Countdown Timer
  pokeBattleState.turnTimerTotal = parseFloat(document.getElementById('pokeVoteDurationSelect')?.value || document.getElementById('drawerTurnLimitSelect')?.value || 30.0) || 30.0;
  pokeBattleState.turnTimerRemaining = pokeBattleState.turnTimerTotal;
  pokeBattleState.viewersTimerTotal = pokeBattleState.turnTimerTotal;
  pokeBattleState.viewersTimerRemaining = pokeBattleState.turnTimerTotal;
  renderPokeTurnTimerUI();

  clearInterval(pokeBattleState.turnTimerInterval);
  clearInterval(pokeBattleState.viewersTimerInterval);
  clearInterval(pokeBattleState.streamerTimerInterval);

  const stepMs = 100;
  pokeBattleState.turnTimerInterval = setInterval(() => {
    pokeBattleState.turnTimerRemaining -= (stepMs / 1000);
    pokeBattleState.viewersTimerRemaining = pokeBattleState.turnTimerRemaining;
    if (pokeBattleState.turnTimerRemaining <= 0) {
      pokeBattleState.turnTimerRemaining = 0;
      pokeBattleState.viewersTimerRemaining = 0;
      clearInterval(pokeBattleState.turnTimerInterval);
      finishSimultaneousPokeTurn();
    }
    renderPokeTurnTimerUI();
  }, stepMs);
}

// Alias for backwards compatibility
function startStreamerPokeTurn() {
  startSimultaneousPokeTurn();
}
function startViewersPokeVote() {
  // In simultaneous mode, viewers vote is initiated inside startSimultaneousPokeTurn
}

function renderStreamerMovesDeck() {
  const sSlot = streamerTeam[streamerActiveIdx];
  const megaForm = getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);
  const megaContainer = document.getElementById('streamerMegaToggleContainer');
  const megaBtnTitle = document.getElementById('streamerMegaBtnTitle');
  const megaBtn = document.getElementById('streamerMegaToggleBtn');
  const megaPill = document.getElementById('streamerMegaPill');

  if (megaForm && !streamerTeamHasMegaEvolved && !sSlot.isMega) {
    if (megaContainer) megaContainer.style.display = 'block';
    if (megaBtnTitle) megaBtnTitle.innerHTML = `<kbd style="background: rgba(0,255,163,0.2); border: 1px solid rgba(0,255,163,0.4); border-radius: 4px; padding: 1px 5px; font-size: 10px; margin-right: 4px; font-family: monospace; color: #00ffa3;">Space</kbd> 🧬 ${megaForm.nameKo} 메가진화 (동시 발동)`;
    if (megaBtn) megaBtn.classList.toggle('active', streamerMegaSelected);
    if (megaPill) {
      megaPill.className = `mega-pill-badge ${streamerMegaSelected ? 'on' : 'off'}`;
      megaPill.innerText = streamerMegaSelected ? '🧬 MEGA ON' : 'OFF';
    }
  } else {
    if (megaContainer) megaContainer.style.display = 'none';
    streamerMegaSelected = false;
  }

  // Check if no moves are usable (PP 0 or Choice/Assault Vest locked out of all remaining moves)
  const allOutOfPP = isSlotForcedStruggle(sSlot);

  const deck = document.getElementById('arenaMoveButtonsDeck');
  if (deck) {
    if (allOutOfPP) {
      const isStruggleSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.move && pokeBattleState.streamerAction.move.name === '발버둥';
      deck.innerHTML = `
        <button type="button" class="poke-move-btn ${isStruggleSelected ? 'selected' : ''}" onclick="handleStreamerStruggleSelect()" style="grid-column: 1 / -1; border: 2px solid #ef4444; background: rgba(239,68,68,0.15); padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 900; font-size: 14px; color: #ef4444;"><kbd style="background: rgba(239,68,68,0.25); border: 1px solid #ef4444; border-radius: 4px; padding: 1px 5px; font-size: 10px; margin-right: 4px; font-family: monospace; color: #fff;">X</kbd> 💥 발버둥 (Struggle) ${isStruggleSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; font-weight: normal; margin-left: 2px;">(다시 클릭 시 취소)</span>' : ''}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-sub); margin-top: 4px;">
            <span>위력 50 (노말) / 명중 100%</span>
            <span style="color: #f87171; font-weight: 700;">⚠️ 최대 HP의 25% 반동 피해</span>
          </div>
        </button>
      `;
      return;
    }

    const keyShortcuts = ['Q', 'W', 'E', 'R'];
    deck.innerHTML = sSlot.pokemon.moves.map((m, i) => {
      const ppObj = sSlot.movesPP ? sSlot.movesPP[i] : null;
      const currentPP = ppObj ? ppObj.currentPP : (m.pp || 15);
      const maxPP = ppObj ? ppObj.maxPP : (m.pp || 15);
      const isOutOfPP = currentPP <= 0;

      const isChoiceLocked = sSlot.choiceMove && sSlot.choiceMove.name !== m.name;
      const isAssaultVestBlocked = sSlot.item === 'assault_vest' && m.category === '변화';
      const disabled = isChoiceLocked || isAssaultVestBlocked || isOutOfPP;
      const isSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'move' && pokeBattleState.streamerAction.moveIdx === i;

      let ppColor = '#ffd700';
      if (currentPP <= 0) ppColor = '#ef4444';
      else if (currentPP <= 3) ppColor = '#f97316';
      else if (currentPP === maxPP) ppColor = '#4ade80';

      return `
        <button type="button" class="poke-move-btn ${isSelected ? 'selected' : ''}" ${disabled ? 'disabled' : ''} onclick="handleStreamerMoveSelect(${i})" style="${isOutOfPP ? 'opacity: 0.45; border-color: rgba(239,68,68,0.3);' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 800; font-size: 13px; color: ${isSelected ? '#00ffa3' : (isOutOfPP ? '#94a3b8' : '#fff')};">
              <kbd style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; padding: 1px 5px; font-size: 10px; margin-right: 4px; font-family: monospace; color: #ffd700;">${keyShortcuts[i] || (i+1)}</kbd>
              ${i+1}. ${m.name} ${isSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; font-weight: normal; margin-left: 2px;">(다시 클릭 시 취소)</span>' : ''}
            </span>
            <div style="display: flex; gap: 4px; align-items: center;">
              <span class="type-badge type-${m.type}" style="font-size: 9px; padding: 1px 4px;">${m.type}</span>
              <span style="font-size: 10px; font-weight: 800; color: ${ppColor}; background: rgba(0,0,0,0.4); padding: 1px 5px; border-radius: 4px;">PP ${currentPP}/${maxPP}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-sub); margin-top: 2px;">
            <span>${m.category === '변화' ? '🛡️ 랭크업/상태' : `위력 ${m.power} / 명중 ${m.acc}%`}</span>
            <span>${isOutOfPP ? '<b style="color: #ef4444;">PP 0 소진</b>' : ''}</span>
          </div>
          ${isChoiceLocked ? '<div style="font-size: 9px; color: #f43f5e;">구애도구로 기술 고정됨</div>' : ''}
          ${isAssaultVestBlocked ? '<div style="font-size: 9px; color: #f43f5e;">돌격조끼로 변화기 불가</div>' : ''}
        </button>
      `;
    }).join('');
  }
}

function cancelStreamerAction() {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;
  if (!pokeBattleState.streamerAction) return;

  pokeBattleState.streamerAction = null;
  renderStreamerMovesDeck();
  renderStreamerSwitchDeck();
  updateStreamerActionStatusUI(false);
  showToast(`👑 ${getStreamerName()} 행동 선택 취소됨`, '↩️');
  updateStreamerControllerPopout();
}

function handleStreamerStruggleSelect() {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;

  // Toggle cancellation if already selected struggle
  if (pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'move' && pokeBattleState.streamerAction.move && pokeBattleState.streamerAction.move.name === '발버둥') {
    cancelStreamerAction();
    return;
  }

  const struggleMove = { name: '발버둥', type: '노말', category: '물리', power: 50, acc: 100, isStruggle: true };
  pokeBattleState.streamerAction = { type: 'move', moveIdx: -1, move: struggleMove, isMega: false };
  renderStreamerMovesDeck();
  renderStreamerSwitchDeck();
  updateStreamerActionStatusUI(false);
  showToast(`👑 ${getStreamerName()} [발버둥] 선택 완료! 🔒 (다시 클릭시 취소)`, '💥');
  updateStreamerControllerPopout();
}

function updateStreamerControllerTimer() {
  if (!streamerControllerWindow || streamerControllerWindow.closed) return;
  try {
    const doc = streamerControllerWindow.document;
    if (!doc) return;
    const isFaintPhase = pokeBattleState.phase === 'faint_switch_streamer';
    const tText = doc.getElementById('popTimerText');
    const tFill = doc.getElementById('popTimerFill');
    if (isFaintPhase) {
      if (tText) tText.innerText = `${Math.max(0, pokeBattleState.faintTimerRemaining || 0).toFixed(1)}s`;
      if (tFill) {
        const pct = ((pokeBattleState.faintTimerRemaining || 0) / (pokeBattleState.faintTimerTotal || 30)) * 100;
        tFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      }
    } else {
      if (tText) tText.innerText = `${Math.max(0, pokeBattleState.turnTimerRemaining || 0).toFixed(1)}s`;
      if (tFill) {
        const pct = ((pokeBattleState.turnTimerRemaining || 0) / (pokeBattleState.turnTimerTotal || 30)) * 100;
        tFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      }
    }
  } catch (err) {}
}

function renderPokeTurnTimerUI() {
  const tText = document.getElementById('arenaVotingTimerText');
  const tFill = document.getElementById('arenaVotingTimerFill');
  if (tText) tText.innerText = `${Math.max(0, pokeBattleState.turnTimerRemaining).toFixed(1)}s`;
  if (tFill) {
    const pct = (Math.max(0, pokeBattleState.turnTimerRemaining) / pokeBattleState.turnTimerTotal) * 100;
    tFill.style.width = `${pct}%`;
  }
  updateStreamerControllerTimer();
}

function renderViewersVotingTimer() {
  renderPokeTurnTimerUI();
}
function renderStreamerTimerUI() {
  renderPokeTurnTimerUI();
}

function handleStreamerMoveSelect(moveIdx) {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;

  // Toggle cancellation if already selected this move
  if (pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'move' && pokeBattleState.streamerAction.moveIdx === moveIdx) {
    cancelStreamerAction();
    return;
  }

  const sSlot = streamerTeam[streamerActiveIdx];
  const move = sSlot.pokemon.moves[moveIdx];
  if (!move) return;
  const ppObj = sSlot.movesPP ? sSlot.movesPP[moveIdx] : null;
  if (ppObj && ppObj.currentPP <= 0) {
    showToast(`⚠️ [${ppObj.name}]은(는) PP가 소진되어 사용할 수 없습니다!`, '⚠️');
    return;
  }
  if (sSlot.choiceMove && sSlot.choiceMove.name !== move.name) {
    showToast(`⚠️ 구애 도구 효과로 [${sSlot.choiceMove.name}]만 사용할 수 있습니다!`, '⚠️');
    return;
  }
  if (sSlot.item === 'assault_vest' && move.category === '변화') {
    showToast(`⚠️ 돌격조끼 효과로 변화 기술 [${move.name}]을(를) 사용할 수 없습니다!`, '⚠️');
    return;
  }
  const willMega = streamerMegaSelected && !streamerTeamHasMegaEvolved && getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);

  pokeBattleState.streamerAction = { type: 'move', moveIdx, move, isMega: !!willMega };

  renderStreamerMovesDeck();
  renderStreamerSwitchDeck();
  updateStreamerActionStatusUI(false);

  showToast(`👑 ${getStreamerName()} 행동 선택 완료! 🔒 (다시 클릭시 취소)`, '🎯');
  updateStreamerControllerPopout();
}
const selectStreamerMove = handleStreamerMoveSelect;
window.selectStreamerMove = handleStreamerMoveSelect;

function handleStreamerSwitchSelect(targetIdx) {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;
  if (streamerTeam[targetIdx].fainted) return;

  // Toggle cancellation if already selected this switch
  if (pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'switch' && pokeBattleState.streamerAction.targetIdx === targetIdx) {
    cancelStreamerAction();
    return;
  }

  pokeBattleState.streamerAction = { type: 'switch', targetIdx, targetPokemon: streamerTeam[targetIdx].pokemon, isMega: false };

  renderStreamerMovesDeck();
  renderStreamerSwitchDeck();
  updateStreamerActionStatusUI(false);

  showToast(`👑 ${getStreamerName()} 교체 결정 완료! 🔒 (다시 클릭시 취소)`, '🔄');
  updateStreamerControllerPopout();
}

// --- Streamer Privacy Mode & Keyboard Shortcuts Engine ---
let streamerPrivacyBlind = false;
let streamerControllerWindow = null;

function handleStreamerShortcutSwitch(candidateOffset) {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'streamer_turn') return;
  if (pokeBattleMode === '1v1') {
    showToast('1v1 에이스 배틀은 교체가 지원되지 않습니다.', '⚠️');
    return;
  }
  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const candidates = [];
  for (let i = 0; i < teamSize; i++) {
    if (i !== streamerActiveIdx) candidates.push(i);
  }
  if (candidateOffset >= candidates.length) return;
  const targetIdx = candidates[candidateOffset];
  if (streamerTeam[targetIdx].fainted || streamerTeam[targetIdx].currentHP <= 0) {
    showToast(`⚠️ [${streamerTeam[targetIdx].pokemon.name}]은(는) 기절하여 교체할 수 없습니다!`, '⚠️');
    return;
  }
  handleStreamerSwitchSelect(targetIdx);
}

let streamerFaintAliveSlots = [];

function handleStreamerShortcutFaint(candidateOffset) {
  if (pokeBattleState.phase !== 'faint_switch_streamer') return;
  let alive = streamerFaintAliveSlots;
  if (!alive || alive.length === 0) {
    const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
    alive = [];
    for (let i = 0; i < teamSize; i++) {
      if (!streamerTeam[i].fainted && streamerTeam[i].currentHP > 0) {
        alive.push(i);
      }
    }
  }
  if (candidateOffset >= alive.length) return;
  handleStreamerFaintSelect(alive[candidateOffset]);
}

function handleBattleGlobalKeydown(e) {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
    return;
  }

  if (!pokeBattleState.active) return;

  if (pokeBattleState.phase === 'simultaneous_turn' || pokeBattleState.phase === 'streamer_turn') {
    if (e.code === 'Enter') {
      e.preventDefault();
      instantExecutePokeTurn();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      cancelStreamerAction();
    } else if (e.code === 'KeyQ') {
      e.preventDefault();
      handleStreamerMoveSelect(0);
    } else if (e.code === 'KeyW') {
      e.preventDefault();
      handleStreamerMoveSelect(1);
    } else if (e.code === 'KeyE') {
      e.preventDefault();
      handleStreamerMoveSelect(2);
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      handleStreamerMoveSelect(3);
    } else if (e.code === 'Space' || e.code === 'KeyM') {
      e.preventDefault();
      toggleStreamerMega();
    } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
      e.preventDefault();
      handleStreamerShortcutSwitch(0);
    } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
      e.preventDefault();
      handleStreamerShortcutSwitch(1);
    } else if (e.code === 'KeyB') {
      e.preventDefault();
      toggleStreamerPrivacyBlind();
    } else if (e.code === 'KeyO') {
      e.preventDefault();
      openStreamerControllerPopout();
    } else if (e.code === 'KeyX') {
      const sSlot = streamerTeam[streamerActiveIdx];
      if (isSlotForcedStruggle(sSlot)) {
        e.preventDefault();
        handleStreamerStruggleSelect();
      }
    }
  } else if (pokeBattleState.phase === 'faint_switch_streamer') {
    if (e.code === 'Digit1' || e.code === 'Numpad1' || e.code === 'KeyQ') {
      e.preventDefault();
      handleStreamerShortcutFaint(0);
    } else if (e.code === 'Digit2' || e.code === 'Numpad2' || e.code === 'KeyW') {
      e.preventDefault();
      handleStreamerShortcutFaint(1);
    }
  }
}
window.addEventListener('keydown', handleBattleGlobalKeydown);

function toggleStreamerPrivacyBlind() {
  streamerPrivacyBlind = !streamerPrivacyBlind;

  const icon = document.getElementById('streamerBlindIcon');
  const label = document.getElementById('streamerBlindLabel');
  const btn = document.getElementById('streamerBlindToggleBtn');
  const blindDeck = document.getElementById('streamerPrivacyBlindDeck');
  const tabsBar = document.getElementById('streamerActionTabsBar');
  const megaContainer = document.getElementById('streamerMegaToggleContainer');
  const movesDeck = document.getElementById('arenaMoveButtonsDeck');
  const switchDeck = document.getElementById('arenaSwitchButtonsDeck');

  if (streamerPrivacyBlind) {
    if (icon) icon.innerText = '🔒';
    if (label) label.innerText = '방송 블라인드 ON';
    if (btn) {
      btn.style.background = 'rgba(0, 255, 163, 0.2)';
      btn.style.borderColor = '#00ffa3';
      btn.style.color = '#00ffa3';
      btn.classList.add('active');
    }
    if (blindDeck) blindDeck.style.display = 'block';
    if (tabsBar) tabsBar.style.display = 'none';
    if (megaContainer) megaContainer.style.display = 'none';
    if (movesDeck) movesDeck.style.display = 'none';
    if (switchDeck) switchDeck.style.display = 'none';
    showToast('🔒 방송 화면 블라인드가 활성화되었습니다. (단축키/제어창으로 안전 조작)', '🛡️');
  } else {
    if (icon) icon.innerText = '👁️';
    if (label) label.innerText = '방송 블라인드 OFF';
    if (btn) {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.classList.remove('active');
    }
    if (blindDeck) blindDeck.style.display = 'none';
    if (tabsBar) tabsBar.style.display = 'flex';
    switchPokeActionTab(streamerActionTab);
    showToast('👁️ 방송 화면 블라인드가 해제되었습니다.', '👀');
  }

  updateStreamerControllerPopout();
}

function openStreamerControllerPopout() {
  // Auto-enable privacy blind on main broadcast screen when popout is opened
  if (!streamerPrivacyBlind) {
    toggleStreamerPrivacyBlind();
  }

  if (streamerControllerWindow && !streamerControllerWindow.closed) {
    streamerControllerWindow.focus();
    updateStreamerControllerPopout();
    return;
  }

  const width = 460;
  const height = 640;
  const left = window.screen.width ? (window.screen.width - width - 30) : 100;
  const top = 50;

  try {
    streamerControllerWindow = window.open('', 'StreamerPokemonController', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`);
  } catch (err) {
    console.error('Popout window open error:', err);
  }

  if (!streamerControllerWindow) {
    showToast('⚠️ 팝업 차단이 감지되었습니다. 브라우저 주소창의 팝업 허용 설정을 확인해주세요.', '⚠️');
    return;
  }

  const doc = streamerControllerWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>🎮 포켓몬 배틀 - 스트리머 비밀 제어기</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif; }
body { background: #080c14; color: #f8fafc; padding: 12px; user-select: none; font-size: 13px; line-height: 1.4; }
.header-bar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 10px; }
.title { font-weight: 900; font-size: 14px; color: #ffd700; display: flex; align-items: center; gap: 6px; }
.timer-wrap { display: flex; align-items: center; gap: 8px; }
.timer-text { font-weight: 900; color: #00ffa3; font-family: monospace; font-size: 14px; }
.progress-bar { width: 100%; height: 5px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
.progress-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #38bdf8, #00ffa3); transition: width 0.1s linear; }

.card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; margin-bottom: 8px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; }
.kbd { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 4px; font-size: 10px; color: #ffd700; font-family: monospace; }

.active-poke-row { display: flex; align-items: center; gap: 10px; }
.poke-img { width: 56px; height: 56px; object-fit: contain; image-rendering: pixelated; }
.hp-bar-track { width: 100%; height: 8px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; margin-top: 4px; }
.hp-bar-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #4ade80); transition: width 0.3s ease; }

.status-alert { background: rgba(255, 215, 0, 0.1); border: 1px dashed rgba(255, 215, 0, 0.4); border-radius: 8px; padding: 6px 10px; font-size: 11px; color: #ffd700; text-align: center; font-weight: 800; margin-bottom: 8px; }
.status-alert.selected { background: rgba(0, 255, 163, 0.15); border: 1px solid #00ffa3; color: #00ffa3; }

.mega-btn { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(168, 85, 247, 0.15); border: 1.5px solid rgba(168, 85, 247, 0.5); border-radius: 8px; cursor: pointer; color: #fff; margin-bottom: 8px; font-weight: 800; font-size: 12px; transition: all 0.2s; }
.mega-btn:hover { background: rgba(168, 85, 247, 0.25); transform: translateY(-1px); }
.mega-btn.active { background: linear-gradient(135deg, rgba(236,72,153,0.35), rgba(168,85,247,0.35)); border-color: #ec4899; box-shadow: 0 0 12px rgba(236,72,153,0.4); color: #00ffa3; }

.moves-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.move-btn { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 10px; cursor: pointer; text-align: left; color: #fff; transition: all 0.15s; display: flex; flex-direction: column; gap: 3px; position: relative; }
.move-btn * { pointer-events: none; }
.move-btn:hover:not(:disabled) { transform: translateY(-2px); border-color: #00ffa3; background: rgba(0, 255, 163, 0.12); }
.move-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.move-btn.selected { border: 2px solid #00ffa3 !important; background: rgba(0, 255, 163, 0.2) !important; box-shadow: 0 0 12px rgba(0, 255, 163, 0.4) !important; }

.switch-row { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
.switch-card { display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 6px 10px; cursor: pointer; transition: all 0.15s; }
.switch-card * { pointer-events: none; }
.switch-card:hover:not(.disabled) { border-color: #38bdf8; background: rgba(56, 189, 248, 0.12); }
.switch-card.selected { border: 1.5px solid #38bdf8 !important; background: rgba(56, 189, 248, 0.2) !important; box-shadow: 0 0 10px rgba(56, 189, 248, 0.3); }
.switch-card.disabled { opacity: 0.4; cursor: not-allowed; }

.btn-cancel { background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; font-weight: 800; transition: all 0.15s; }
.btn-cancel:hover { background: rgba(239, 68, 68, 0.45); color: #fff; }

.quick-tools { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; margin-top: 6px; }
.btn-small { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 4px 8px; color: #cbd5e1; font-size: 11px; cursor: pointer; font-weight: 700; }
.btn-small:hover { background: rgba(255,255,255,0.15); color: #fff; }
.btn-small.active { background: rgba(0,255,163,0.2); border-color: #00ffa3; color: #00ffa3; }

.type-badge { font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 800; display: inline-block; color: #fff; }
.type-노말 { background: #9fa19f; } .type-불꽃 { background: #e62829; } .type-물 { background: #2980ef; }
.type-풀 { background: #3fa129; } .type-전기 { background: #fac000; color: #000; } .type-얼음 { background: #3dcef3; color: #000; }
.type-격투 { background: #ff8000; } .type-독 { background: #9141cb; } .type-땅 { background: #915121; }
.type-비행 { background: #81b9ef; } .type-에스퍼 { background: #ef4179; } .type-벌레 { background: #91a119; }
.type-바위 { background: #afa981; } .type-고스트 { background: #704170; } .type-드래곤 { background: #5060e1; }
.type-악 { background: #50413f; } .type-강철 { background: #60a1b8; } .type-페어리 { background: #ef70ef; }
  
/* --- bHaptics Integration Styles --- */
.haptic-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(244, 63, 94, 0.15);
  color: #f43f5e;
  border: 1px solid rgba(244, 63, 94, 0.3);
  cursor: pointer;
}
.haptic-indicator.connected {
  background: rgba(0, 255, 163, 0.15);
  color: #00ffa3;
  border-color: rgba(0, 255, 163, 0.4);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.btn-haptic {
  background: rgba(6, 182, 212, 0.15);
  border: 1px solid #06b6d4;
  color: #06b6d4;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.btn-haptic:hover {
  background: rgba(6, 182, 212, 0.25);
}

/* 2D TactSuit Motors Matrix */
.haptic-sidebar-widget {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.35);
  border-radius: 12px;
  padding: 14px;
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
.suit-viewer-wrapper {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #080c14;
  border-radius: 10px;
  padding: 12px;
}
.suit-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.suit-column-title {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 1px;
}
.suit-grid {
  display: grid;
  grid-template-columns: repeat(4, 18px);
  grid-template-rows: repeat(5, 18px);
  gap: 5px;
}
.motor-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1e293b;
  border: 1px solid #334155;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}
.test-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.test-btn {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.12);
  color: #cbd5e1;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.test-btn:hover {
  background: #1e293b;
  color: #fff;
}

</style>
</head>
<body>
  <div class="header-bar">
<div class="title">
  <span>🎮</span> <span id="popTitle">스트리머 비밀 제어기</span>
</div>
<div class="timer-wrap">
  <span class="badge" style="background: rgba(255,215,0,0.2); color: #ffd700;" id="popRoundBadge">ROUND 1</span>
  <span class="timer-text" id="popTimerText">30.0s</span>
</div>
  </div>
  <div class="progress-bar">
<div class="progress-fill" id="popTimerFill"></div>
  </div>

  <div id="popStatusAlert" class="status-alert">
행동 선택 대기 중...
  </div>

  <!-- Active Pokemon Summary -->
  <div class="card" id="popActivePokeCard">
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
  <span style="font-size: 11px; font-weight: 800; color: #ffd700;">내 출전 포켓몬</span>
  <span id="popPokeItemBadge" class="badge" style="background: rgba(255,215,0,0.15); color: #ffd700;">🎒 도구</span>
</div>
<div class="active-poke-row">
  <img id="popPokeSprite" class="poke-img" src="" alt="포켓몬">
  <div style="flex: 1;">
    <div style="display: flex; justify-content: space-between; align-items: baseline;">
      <span id="popPokeName" style="font-size: 14px; font-weight: 900; color: #fff;"></span>
      <span id="popPokeHPText" style="font-size: 12px; font-weight: 800; color: #4ade80;"></span>
    </div>
    <div class="hp-bar-track">
      <div id="popPokeHPBar" class="hp-bar-fill"></div>
    </div>
    <div id="popPokeTypes" style="display: flex; gap: 4px; margin-top: 4px;"></div>
  </div>
</div>
  </div>

  <!-- Opponent Pokemon Quick Hint -->
  <div class="card" id="popOpponentCard" style="background: rgba(30, 41, 59, 0.5); padding: 6px 10px; margin-bottom: 8px;">
<div style="display: flex; justify-content: space-between; align-items: center;">
  <div style="display: flex; align-items: center; gap: 8px;">
    <img id="popOpponentSprite" style="width: 28px; height: 28px; object-fit: contain; image-rendering: pixelated;" src="" alt="상대">
    <div>
      <span style="font-size: 11px; color: #94a3b8;">상대(시청자):</span>
      <b id="popOpponentName" style="color: #38bdf8; font-size: 12px; margin-left: 4px;"></b>
    </div>
  </div>
  <div id="popOpponentTypes" style="display: flex; gap: 3px;"></div>
</div>
  </div>

  <!-- Mega Evolution Toggle -->
  <div id="popMegaContainer" style="display: none;">
<button type="button" id="popMegaBtn" class="mega-btn" onclick="triggerMega()">
  <div style="display: flex; align-items: center; gap: 6px;">
    <span style="font-size: 14px;">🧬</span>
    <span id="popMegaTitle">메가진화 (동시 발동)</span>
  </div>
  <span id="popMegaPill" class="badge" style="background: rgba(255,255,255,0.1); color: #fff;">
    <kbd class="kbd">Space</kbd> OFF
  </span>
</button>
  </div>

  <!-- 4 Moves Grid -->
  <div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; display: flex; justify-content: space-between;">
<span>⚔️ 기술 선택 (단축키: Q, W, E, R)</span>
<span id="popChoiceLockedAlert" style="color: #f43f5e; font-size: 10px; display: none;">구애 도구 고정</span>
  </div>
  <div class="moves-grid" id="popMovesGrid">
<!-- Populated by updateStreamerControllerPopout -->
  </div>

  <!-- Switch Teammates Section -->
  <div id="popSwitchSection" style="margin-top: 4px;">
<div style="font-size: 11px; font-weight: 800; color: #94a3b8; margin-bottom: 4px;">
  🔄 팀원 교체 (단축키: 1, 2)
</div>
<div class="switch-row" id="popSwitchList">
  <!-- Populated by updateStreamerControllerPopout -->
</div>
  </div>

  <!-- Faint Switch Section (Only when fainted) -->
  <div id="popFaintSection" style="display: none; margin-top: 4px;">
<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 8px; margin-bottom: 8px; text-align: center;">
  <div style="color: #ef4444; font-weight: 900; font-size: 13px;">💀 출전 포켓몬 기절!</div>
  <div style="font-size: 11px; color: #fca5a5;">다음 출전 포켓몬을 선택하세요 (단축키: 1, 2)</div>
</div>
<div class="switch-row" id="popFaintList"></div>
  </div>

  <!-- Bottom Quick Tools -->
  <div class="quick-tools">
<button type="button" id="popBlindBtn" class="btn-small" onclick="triggerBlind()">
  👁️ 방송 블라인드 <kbd class="kbd">B</kbd>
</button>
<div style="font-size: 10px; color: #64748b;">
  ※ 키보드로 제어기 창에서도 즉시 선택 가능
</div>
  </div>

  <script>
function triggerMove(i) {
  if (window.opener && !window.opener.closed) {
    window.opener.handleStreamerMoveSelect(i);
  }
}
function triggerCancel() {
  if (window.opener && !window.opener.closed) {
    window.opener.cancelStreamerAction();
  }
}
function triggerStruggle() {
  if (window.opener && !window.opener.closed) {
    window.opener.handleStreamerStruggleSelect();
  }
}
function triggerMega() {
  if (window.opener && !window.opener.closed) {
    window.opener.toggleStreamerMega();
  }
}
function triggerSwitch(i) {
  if (window.opener && !window.opener.closed) {
    window.opener.handleStreamerSwitchSelect(i);
  }
}
function triggerFaintSelect(i) {
  if (window.opener && !window.opener.closed) {
    window.opener.handleStreamerFaintSelect(i);
  }
}
function triggerBlind() {
  if (window.opener && !window.opener.closed) {
    window.opener.toggleStreamerPrivacyBlind();
  }
}

window.addEventListener('keydown', (e) => {
  if (window.opener && !window.opener.closed) {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      window.opener.cancelStreamerAction();
      return;
    }
    window.opener.handleBattleGlobalKeydown(e);
  }
});
  <\/script>

  

</body>
</html>`);
  doc.close();

  setTimeout(() => {
    updateStreamerControllerPopout();
  }, 50);
  showToast('🎮 스트리머 독립 제어창이 열렸습니다. 보조 모니터로 이동해 사용하세요!', '🚀');
}

function updateStreamerControllerPopout() {
  if (!streamerControllerWindow || streamerControllerWindow.closed) return;

  try {
    const doc = streamerControllerWindow.document;
    if (!doc || !doc.getElementById('popMovesGrid')) return;

    const isFaintPhase = pokeBattleState.phase === 'faint_switch_streamer';

    const rBadge = doc.getElementById('popRoundBadge');
    if (rBadge) rBadge.innerText = `ROUND ${pokeBattleState.round || 1}`;

    const tText = doc.getElementById('popTimerText');
    const tFill = doc.getElementById('popTimerFill');
    if (isFaintPhase) {
      if (tText) tText.innerText = `${Math.max(0, pokeBattleState.faintTimerRemaining || 0).toFixed(1)}s`;
      if (tFill) {
        const pct = ((pokeBattleState.faintTimerRemaining || 0) / (pokeBattleState.faintTimerTotal || 30)) * 100;
        tFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      }
    } else {
      if (tText) tText.innerText = `${Math.max(0, pokeBattleState.turnTimerRemaining || 0).toFixed(1)}s`;
      if (tFill) {
        const pct = ((pokeBattleState.turnTimerRemaining || 0) / (pokeBattleState.turnTimerTotal || 30)) * 100;
        tFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      }
    }

    const popBlindBtn = doc.getElementById('popBlindBtn');
    if (popBlindBtn) {
      popBlindBtn.className = `btn-small ${streamerPrivacyBlind ? 'active' : ''}`;
      popBlindBtn.innerHTML = `🔒 방송 블라인드: <b>${streamerPrivacyBlind ? 'ON' : 'OFF'}</b> <kbd class="kbd">B</kbd>`;
    }

    const statusEl = doc.getElementById('popStatusAlert');
    if (statusEl) {
      if (!pokeBattleState.streamerAction) {
        statusEl.className = 'status-alert';
        statusEl.innerHTML = '👑 <b>행동 선택 대기 중...</b> (단축키: Q, W, E, R / 1, 2)';
      } else {
        statusEl.className = 'status-alert selected';
        let actSummary = '';
        if (pokeBattleState.streamerAction.type === 'move') {
          const m = pokeBattleState.streamerAction.move;
          const isMega = pokeBattleState.streamerAction.isMega;
          actSummary = `[${isMega ? '🧬 MEGA ' : ''}${m.name}]`;
        } else if (pokeBattleState.streamerAction.type === 'switch') {
          const tp = pokeBattleState.streamerAction.targetPokemon;
          actSummary = `[${tp.name} 교체]`;
        }
        statusEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              👑 <b>선택 완료</b>: <b style="color: #fff;">${actSummary}</b> 🔒
            </div>
            <button type="button" class="btn-cancel" onclick="triggerCancel()">
              ✖️ 선택 취소 (Esc)
            </button>
          </div>
        `;
      }
    }

    const sSlot = streamerTeam[streamerActiveIdx];
    const sP = sSlot ? sSlot.pokemon : null;
    const vSlot = viewersTeam[viewersActiveIdx];
    const vP = vSlot ? vSlot.pokemon : null;

    if (sSlot && sP) {
      const sSpr = doc.getElementById('popPokeSprite');
      if (sSpr) sSpr.src = sP.sprite_front || sP.sprite_back;

      const sName = doc.getElementById('popPokeName');
      if (sName) sName.innerHTML = sSlot.isMega ? `<span style="color: #00ffa3;">🧬 MEGA</span> ${sP.name}` : sP.name;

      const sHPText = doc.getElementById('popPokeHPText');
      if (sHPText) sHPText.innerText = `${Math.max(0, Math.round(sSlot.currentHP))} / ${sSlot.maxHP}`;

      const sHPBar = doc.getElementById('popPokeHPBar');
      if (sHPBar) {
        const hpPct = Math.max(0, (sSlot.currentHP / sSlot.maxHP) * 100);
        sHPBar.style.width = `${hpPct}%`;
        sHPBar.style.background = hpPct > 50 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : hpPct > 20 ? 'linear-gradient(90deg, #eab308, #facc15)' : 'linear-gradient(90deg, #ef4444, #f87171)';
      }

      const sTypes = doc.getElementById('popPokeTypes');
      if (sTypes) {
        sTypes.innerHTML = sP.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('');
      }

      const sItem = getItemObj(sSlot.item);
      const sItemBadge = doc.getElementById('popPokeItemBadge');
      if (sItemBadge) {
        sItemBadge.innerHTML = sSlot.isMega ? '🧬 MEGA' : `${sItem.emoji} ${sItem.name}`;
      }

      if (vSlot && vP) {
        const oSpr = doc.getElementById('popOpponentSprite');
        if (oSpr) oSpr.src = vP.sprite_front;
        const oName = doc.getElementById('popOpponentName');
        if (oName) oName.innerText = vSlot.isMega ? `[MEGA] ${vP.name}` : vP.name;
        const oTypes = doc.getElementById('popOpponentTypes');
        if (oTypes) {
          oTypes.innerHTML = vP.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('');
        }
      }

      const megaForm = getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);
      const megaCont = doc.getElementById('popMegaContainer');
      const megaBtn = doc.getElementById('popMegaBtn');
      const megaTitle = doc.getElementById('popMegaTitle');
      const megaPill = doc.getElementById('popMegaPill');

      if (megaForm && !streamerTeamHasMegaEvolved && !sSlot.isMega && !isFaintPhase) {
        if (megaCont) megaCont.style.display = 'block';
        if (megaTitle) megaTitle.innerText = `🧬 ${megaForm.nameKo} 메가진화 (동시 발동)`;
        if (megaBtn) megaBtn.className = `mega-btn ${streamerMegaSelected ? 'active' : ''}`;
        if (megaPill) {
          megaPill.className = `badge ${streamerMegaSelected ? 'active' : ''}`;
          megaPill.style.background = streamerMegaSelected ? 'rgba(0,255,163,0.3)' : 'rgba(255,255,255,0.1)';
          megaPill.style.color = streamerMegaSelected ? '#00ffa3' : '#fff';
          megaPill.innerHTML = `<kbd class="kbd">Space</kbd> ${streamerMegaSelected ? '🧬 MEGA ON' : 'OFF'}`;
        }
      } else {
        if (megaCont) megaCont.style.display = 'none';
      }

      const movesGrid = doc.getElementById('popMovesGrid');
      const choiceAlert = doc.getElementById('popChoiceLockedAlert');
      if (choiceAlert) {
        choiceAlert.style.display = sSlot.choiceMove ? 'inline-block' : 'none';
      }

      const allOutOfPP = isSlotForcedStruggle(sSlot);
      if (movesGrid) {
        if (allOutOfPP) {
          const isStruggleSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.move && pokeBattleState.streamerAction.move.name === '발버둥';
          movesGrid.innerHTML = `
            <button type="button" class="move-btn ${isStruggleSelected ? 'selected' : ''}" onclick="triggerStruggle()" style="grid-column: 1 / -1; border-color: #ef4444; background: rgba(239,68,68,0.2);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 900; color: #ef4444;"><kbd class="kbd">X</kbd> 💥 발버둥 (Struggle) ${isStruggleSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; margin-left: 2px;">(취소)</span>' : ''}</span>
                <span class="badge" style="background: #ef4444; color: #fff;">사용 가능 기술 없음</span>
              </div>
              <div style="font-size: 11px; color: #fca5a5; margin-top: 3px;">위력 50 / 최대 HP의 25% 반동 피해</div>
            </button>
          `;
        } else {
          const keyShortcuts = ['Q', 'W', 'E', 'R'];
          movesGrid.innerHTML = sSlot.pokemon.moves.map((m, i) => {
            const ppObj = sSlot.movesPP ? sSlot.movesPP[i] : null;
            const currentPP = ppObj ? ppObj.currentPP : (m.pp || 15);
            const maxPP = ppObj ? ppObj.maxPP : (m.pp || 15);
            const isOutOfPP = currentPP <= 0;

            const isChoiceLocked = sSlot.choiceMove && sSlot.choiceMove.name !== m.name;
            const isAssaultVestBlocked = sSlot.item === 'assault_vest' && m.category === '변화';
            const disabled = isChoiceLocked || isAssaultVestBlocked || isOutOfPP || isFaintPhase;
            const isSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'move' && pokeBattleState.streamerAction.moveIdx === i;

            let effectTag = '';
            if (vP && m.power > 0) {
              let mult = 1.0;
              vP.types.forEach(defType => {
                if (pokeTypeChart[m.type] && pokeTypeChart[m.type][defType] !== undefined) {
                  mult *= pokeTypeChart[m.type][defType];
                }
              });
              if (mult >= 2.0) {
                effectTag = `<span class="badge" style="background: rgba(239,68,68,0.25); color: #f87171; border: 1px solid #ef4444; font-size: 9px;">${mult}x 효과발군</span>`;
              } else if (mult > 0 && mult < 1.0) {
                effectTag = `<span class="badge" style="background: rgba(148,163,184,0.2); color: #94a3b8; font-size: 9px;">${mult}x 반감</span>`;
              } else if (mult === 0) {
                effectTag = `<span class="badge" style="background: rgba(100,116,139,0.3); color: #64748b; font-size: 9px;">0x 무효</span>`;
              }
            }

            let ppColor = '#ffd700';
            if (currentPP <= 0) ppColor = '#ef4444';
            else if (currentPP <= 3) ppColor = '#f97316';
            else if (currentPP === maxPP) ppColor = '#4ade80';

            return `
              <button type="button" class="move-btn ${isSelected ? 'selected' : ''}" ${disabled ? 'disabled' : ''} onclick="triggerMove(${i})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 800; color: ${isSelected ? '#00ffa3' : '#fff'}; font-size: 12px;">
                    <kbd class="kbd">${keyShortcuts[i]}</kbd> ${m.name} ${isSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; margin-left: 2px;">(취소)</span>' : ''}
                  </span>
                  <span class="type-badge type-${m.type}">${m.type}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: ${isSelected ? '#86efac' : '#94a3b8'}; margin-top: 2px;">
                  <span>${m.category === '변화' ? '🛡️ 변화' : `위력 ${m.power}`}</span>
                  <span style="color: ${ppColor}; font-weight: 800;">PP ${currentPP}/${maxPP}</span>
                </div>
                ${effectTag ? `<div style="margin-top: 2px;">${effectTag}</div>` : ''}
              </button>
            `;
          }).join('');
        }
      }

      const switchSection = doc.getElementById('popSwitchSection');
      const switchList = doc.getElementById('popSwitchList');
      if (switchSection && switchList) {
        if (pokeBattleMode === '1v1') {
          switchSection.style.display = 'none';
        } else {
          switchSection.style.display = isFaintPhase ? 'none' : 'block';
          const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
          const candidates = [];
          for (let i = 0; i < teamSize; i++) {
            if (i !== streamerActiveIdx) candidates.push({ idx: i, slot: streamerTeam[i] });
          }

          switchList.innerHTML = candidates.map((c, sIdx) => {
            const p = c.slot.pokemon;
            const curHP = Math.max(0, c.slot.currentHP || 0);
            const maxHP = c.slot.maxHP || 1;
            const isFainted = c.slot.fainted || curHP <= 0;
            const isSelected = pokeBattleState.streamerAction && pokeBattleState.streamerAction.type === 'switch' && pokeBattleState.streamerAction.targetIdx === c.idx;
            const shortcutNum = sIdx + 1;

            return `
              <div class="switch-card ${isFainted ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" onclick="${isFainted ? '' : `triggerSwitch(${c.idx})`}">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <kbd class="kbd">${shortcutNum}</kbd>
                  <img src="${p.sprite_front}" alt="${p.name}" style="width: 28px; height: 28px; object-fit: contain; image-rendering: pixelated;">
                  <div>
                    <div style="font-weight: 800; font-size: 12px; color: ${isSelected ? '#38bdf8' : '#fff'};">${c.idx+1}번. ${p.name} ${isSelected ? '✓ <span style="font-size: 10px; color: #fca5a5; margin-left: 2px;">(취소)</span>' : ''}</div>
                    <div style="display: flex; gap: 3px; margin-top: 1px;">
                      ${p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
                    </div>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 11px; font-weight: 800; color: ${isFainted ? '#ef4444' : '#4ade80'};">${isFainted ? '💀 기절' : `HP ${curHP}/${maxHP}`}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      const faintSection = doc.getElementById('popFaintSection');
      const faintList = doc.getElementById('popFaintList');
      if (faintSection && faintList) {
        if (isFaintPhase) {
          faintSection.style.display = 'block';
          const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
          const aliveSlots = [];
          for (let i = 0; i < teamSize; i++) {
            if (!streamerTeam[i].fainted && streamerTeam[i].currentHP > 0) aliveSlots.push(i);
          }
          faintList.innerHTML = aliveSlots.map((idx, fIdx) => {
            const slot = streamerTeam[idx];
            const p = slot.pokemon;
            const shortcutNum = fIdx + 1;
            return `
              <div class="switch-card" onclick="triggerFaintSelect(${idx})" style="border-color: #ffd700; background: rgba(255,215,0,0.1);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <kbd class="kbd">${shortcutNum}</kbd>
                  <img src="${p.sprite_front}" alt="${p.name}" style="width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated;">
                  <div>
                    <div style="font-weight: 800; font-size: 13px; color: #ffd700;">[${idx+1}번] ${p.name}</div>
                    <div style="display: flex; gap: 3px; margin-top: 2px;">
                      ${p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
                    </div>
                  </div>
                </div>
                <div>
                  <button type="button" class="btn-small" style="background: #ffd700; color: #000; font-weight: 900;">⚡ 출전</button>
                </div>
              </div>
            `;
          }).join('');
        } else {
          faintSection.style.display = 'none';
        }
      }
    }
  } catch (err) {
    console.error('Error updating streamer popout window:', err);
  }
}

function finishSimultaneousPokeTurn() {
  if (pokeBattleState.phase !== 'simultaneous_turn' && pokeBattleState.phase !== 'viewers_vote') return;
  clearInterval(pokeBattleState.turnTimerInterval);
  pokeBattleState.phase = 'turn_revealing';

  // 1. Resolve Streamer Action
  const sSlot = streamerTeam[streamerActiveIdx];
  if (!pokeBattleState.streamerAction) {
    if (isSlotForcedStruggle(sSlot)) {
      const struggleMove = { name: '발버둥', type: '노말', category: '물리', power: 50, acc: 100, isStruggle: true };
      pokeBattleState.streamerAction = { type: 'move', moveIdx: -1, move: struggleMove, isMega: false };
      showToast(`⏱️ ${getStreamerName()} 선택 시간 초과! [발버둥] 자동 발동`, '💥');
    } else {
      let validMoveIdx = 0;
      if (sSlot.choiceMove) {
        const idx = sSlot.pokemon.moves.findIndex(m => m.name === sSlot.choiceMove.name);
        if (idx !== -1 && (!sSlot.movesPP || sSlot.movesPP[idx].currentPP > 0)) validMoveIdx = idx;
      } else {
        const available = sSlot.pokemon.moves
          .map((m, idx) => ({ m, idx, pp: sSlot.movesPP ? sSlot.movesPP[idx].currentPP : (m.pp || 15) }))
          .filter(x => x.pp > 0 && !(sSlot.item === 'assault_vest' && x.m.category === '변화'));
        if (available.length > 0) {
          validMoveIdx = available[Math.floor(Math.random() * available.length)].idx;
        }
      }
      const move = sSlot.pokemon.moves[validMoveIdx];
      const willMega = streamerMegaSelected && !streamerTeamHasMegaEvolved && getAvailableMegaEvolution(sSlot.pokemon, sSlot.item);
      pokeBattleState.streamerAction = { type: 'move', moveIdx: validMoveIdx, move, isMega: !!willMega };
      showToast(`⏱️ ${getStreamerName()} 선택 시간 초과! [${move.name}] 자동 발동`, '🎲');
    }
  }

  // 2. Resolve Viewers Vote Action
  const vSlot = viewersTeam[viewersActiveIdx];
  const validCandidateKeys = [];
  const vMega = getAvailableMegaEvolution(vSlot.pokemon, vSlot.item);
  const canMega = vMega && !viewersTeamHasMegaEvolved && !vSlot.isMega;

  const allViewersForcedStruggle = isSlotForcedStruggle(vSlot);

  if (allViewersForcedStruggle) {
    validCandidateKeys.push('struggle');
  } else {
    vSlot.pokemon.moves.forEach((m, i) => {
      const ppObj = vSlot.movesPP ? vSlot.movesPP[i] : null;
      const currentPP = ppObj ? ppObj.currentPP : (m.pp || 15);
      const isOutOfPP = currentPP <= 0;

      const isLocked = vSlot.choiceMove && vSlot.choiceMove.name !== m.name;
      const isAV = vSlot.item === 'assault_vest' && m.category === '변화';
      if (!isLocked && !isAV && !isOutOfPP) {
        validCandidateKeys.push(`move_${i + 1}`);
        if (canMega) validCandidateKeys.push(`mega_${i + 1}`);
      }
    });
  }

  let switchCounter = 5;
  const switchIndexMap = {};
  if (pokeBattleMode === '3v3') {
    for (let i = 0; i < 3; i++) {
      if (i !== viewersActiveIdx) {
        if (!viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) {
          validCandidateKeys.push(`switch_${switchCounter}`);
          switchIndexMap[`switch_${switchCounter}`] = i;
        }
        switchCounter++;
      }
    }
  }

  let maxVotes = 0;
  let topChoices = [];
  for (const key of validCandidateKeys) {
    const v = pokeVoteCounts[key] || 0;
    if (v > maxVotes) {
      maxVotes = v;
      topChoices = [key];
    } else if (v === maxVotes && maxVotes > 0) {
      topChoices.push(key);
    }
  }

  let pickedKey = validCandidateKeys[0] || 'move_1';
  if (maxVotes > 0 && topChoices.length > 0) {
    pickedKey = topChoices[Math.floor(Math.random() * topChoices.length)];
  } else {
    pickedKey = validCandidateKeys[Math.floor(Math.random() * validCandidateKeys.length)] || validCandidateKeys[0] || 'struggle';
  }

  let viewersChoiceName = '';
  if (pickedKey === 'struggle') {
    const struggleMove = { name: '발버둥', type: '노말', category: '물리', power: 50, acc: 100, isStruggle: true };
    pokeBattleState.viewersAction = { type: 'move', moveIdx: -1, move: struggleMove, isMega: false };
    viewersChoiceName = '발버둥';
  } else if (pickedKey.startsWith('move_')) {
    const moveIdx = parseInt(pickedKey.replace('move_', ''), 10) - 1;
    const move = vSlot.pokemon.moves[moveIdx];
    pokeBattleState.viewersAction = { type: 'move', moveIdx, move, isMega: false };
    viewersChoiceName = move.name;
  } else if (pickedKey.startsWith('mega_')) {
    const moveIdx = parseInt(pickedKey.replace('mega_', ''), 10) - 1;
    const move = vSlot.pokemon.moves[moveIdx];
    pokeBattleState.viewersAction = { type: 'move', moveIdx, move, isMega: true };
    viewersChoiceName = `🧬 MEGA ${move.name}`;
  } else if (pickedKey.startsWith('switch_')) {
    const targetIdx = switchIndexMap[pickedKey];
    pokeBattleState.viewersAction = { type: 'switch', targetIdx, targetPokemon: viewersTeam[targetIdx].pokemon, isMega: false };
    viewersChoiceName = `${viewersTeam[targetIdx].pokemon.name} 교체`;
  }

  // 3. Reveal phase: Reveal both streamer's choice and viewers' vote counts
  renderPokeVotingBarsUI(true, pickedKey);
  updateStreamerActionStatusUI(true);

  const sAct = pokeBattleState.streamerAction;
  const sName = sAct.type === 'switch' ? `${sAct.targetPokemon.name} 교체` : `${sAct.isMega ? '🧬 MEGA ' : ''}${sAct.move.name}`;

  setBattleDialogue(`📊 <b>투표 종료 & 공개!</b> 시청자: <b>[${viewersChoiceName}]</b> (👑 당선) vs 스트리머: <b>[${sName}]</b>`);

  // 4. Snappy delay so everyone sees the revealed votes before attacking (scaled by battle speed)
  setTimeout(() => {
    executeBattleTurnSequence();
  }, Math.max(80, Math.round(380 / (window.pokeBattleSpeed || 1.5))));
}

function finishViewersPokeVote() {
  finishSimultaneousPokeTurn();
}

function handleLivePokeBattleChatVote(nickname, msg, uid, now) {
  if (!pokeBattleState.active) return;

  // Case A: Normal Turn Viewers Vote (Simultaneous)
  if (pokeBattleState.phase === 'simultaneous_turn' || pokeBattleState.phase === 'viewers_vote') {
    const clean = msg.trim().toUpperCase().replace(/\s+/g, '');
    const vSlot = viewersTeam[viewersActiveIdx];
    const vMega = getAvailableMegaEvolution(vSlot.pokemon, vSlot.item);
    const canMega = vMega && !viewersTeamHasMegaEvolved && !vSlot.isMega;

    let choiceKey = null;

    // Mega Move Detection: "MEGA 1", "메가1", "M1", "진화1", "1MEGA", "1메가"
    const megaMatch = clean.match(/^(?:MEGA|메가|진화|M)([1-4])$/) || clean.match(/^([1-4])(?:MEGA|메가|진화|M)$/);
    if (megaMatch && canMega) {
      const moveNum = parseInt(megaMatch[1], 10);
      choiceKey = `mega_${moveNum}`;
    }
    // Plain numbers 1~4 (moves)
    else if (/^[1-4]$/.test(clean)) {
      const num = parseInt(clean, 10);
      choiceKey = `move_${num}`;
    }

    // Check for 3v3 switch keywords: "5", "6", "교체1", "1번교체", "1번", "교체2", "2번", "교체3", "3번", or Pokemon names
    if (!choiceKey && pokeBattleMode === '3v3') {
      let switchCounter = 5;
      for (let i = 0; i < 3; i++) {
        if (i !== viewersActiveIdx) {
          const slotNum = i + 1; // 1, 2, or 3
          const pName = viewersTeam[i].pokemon.name.toUpperCase().replace(/\s+/g, '');
          const isMatch = (
            clean === String(switchCounter) ||
            clean === `교체${slotNum}` ||
            clean === `${slotNum}번교체` ||
            clean === `${slotNum}번` ||
            clean === `${slotNum}교체` ||
            clean === `교체${pName}` ||
            clean === pName
          );
          if (isMatch) {
            if (!viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) {
              choiceKey = `switch_${switchCounter}`;
            }
            break;
          }
          switchCounter++;
        }
      }
    }

    // Fallback: if 1v1 or "1번~4번" wasn't a bench switch slot, treat as move 1~4
    if (!choiceKey && /^[1-4]번$/.test(clean)) {
      const num = parseInt(clean.replace('번', ''), 10);
      choiceKey = `move_${num}`;
    }

    // Match move names
    if (!choiceKey) {
      vSlot.pokemon.moves.forEach((m, idx) => {
        const mName = m.name.toUpperCase().replace(/\s+/g, '');
        if (clean === mName) {
          choiceKey = `move_${idx + 1}`;
        } else if (clean === `메가${mName}` && canMega) {
          choiceKey = `mega_${idx + 1}`;
        }
      });
    }

    // Check struggle vote if no moves are usable (PP 0 or locked/blocked out)
    const allViewersForcedStruggle = isSlotForcedStruggle(vSlot);
    if (allViewersForcedStruggle && (clean === '1' || clean === '발버둥' || clean === 'STRUGGLE' || clean === '1번')) {
      choiceKey = 'struggle';
    }

    // Reject vote if move is out of PP, Choice-locked, or blocked by Assault Vest
    if (choiceKey && (choiceKey.startsWith('move_') || choiceKey.startsWith('mega_'))) {
      const mIdx = parseInt(choiceKey.replace(/^(?:move_|mega_)/, ''), 10) - 1;
      const mObj = vSlot.pokemon.moves[mIdx];
      const ppLeft = (vSlot.movesPP && vSlot.movesPP[mIdx]) ? vSlot.movesPP[mIdx].currentPP : (mObj ? (mObj.pp || 15) : 0);
      const isLocked = vSlot.choiceMove && mObj && vSlot.choiceMove.name !== mObj.name;
      const isAV = vSlot.item === 'assault_vest' && mObj && mObj.category === '변화';
      if (!mObj || ppLeft <= 0 || isLocked || isAV || allViewersForcedStruggle) {
        choiceKey = null;
      }
    }

    if (choiceKey) {
      pokeVoteUsers.set(uid, choiceKey);
      recomputePokeVotes();
      renderPokeVotingBarsUI();
    }
    return;
  }

  // Case B: Faint Replacement Viewers Vote
  if (pokeBattleState.phase === 'faint_switch_viewers') {
    const clean = msg.trim().toUpperCase().replace(/\s+/g, '');
    let choiceSlotIdx = null;

    const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
    for (let i = 0; i < teamSize; i++) {
      if (!viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) {
        const slotNum = i + 1;
        const pName = viewersTeam[i].pokemon.name.toUpperCase().replace(/\s+/g, '');
        if (
          clean === String(slotNum) ||
          clean === `${slotNum}번` ||
          clean === `${slotNum}번출전` ||
          clean === `${slotNum}출전` ||
          clean === pName ||
          clean === `출전${pName}`
        ) {
          choiceSlotIdx = i;
          break;
        }
      }
    }

    if (choiceSlotIdx !== null) {
      faintVoteUsers.set(uid, choiceSlotIdx);
      recomputeFaintVotes();
      renderFaintVoteCandidatesUI(faintAliveSlotsCached, false);
    }
  }
}

function recomputePokeVotes() {
  pokeVoteCounts = {};
  for (const [uid, choice] of pokeVoteUsers.entries()) {
    pokeVoteCounts[choice] = (pokeVoteCounts[choice] || 0) + 1;
  }
}

function renderPokeVotingBarsUI(isReveal = false, winningKey = null) {
  const container = document.getElementById('arenaVoteCandidateBars');
  const vSlot = viewersTeam[viewersActiveIdx];
  if (!container || !vSlot) return;

  const total = pokeVoteUsers.size;
  const candidates = [];
  const vMega = getAvailableMegaEvolution(vSlot.pokemon, vSlot.item);
  const canMega = vMega && !viewersTeamHasMegaEvolved && !vSlot.isMega;

  // Update HUD participant counter
  const pBadge = document.getElementById('arenaVoteParticipantsBadge');
  if (pBadge) {
    pBadge.innerHTML = `👥 투표 참여: <b>${total}</b>명`;
  }

  const allOutOfPP = isSlotForcedStruggle(vSlot);

  if (allOutOfPP) {
    candidates.push({
      key: 'struggle',
      label: '💥 [발버둥] Struggle',
      ppText: '반동 25%',
      subtext: '1 또는 발버둥 (사용 가능 기술 없음)',
      tag: '노말',
      tagClass: 'type-노말',
      disabled: false,
      isStruggle: true
    });
  } else {
    // 4 Moves (and Mega Moves if available)
    vSlot.pokemon.moves.forEach((m, i) => {
      const ppObj = vSlot.movesPP ? vSlot.movesPP[i] : null;
      const currentPP = ppObj ? ppObj.currentPP : (m.pp || 15);
      const maxPP = ppObj ? ppObj.maxPP : (m.pp || 15);
      const isOutOfPP = currentPP <= 0;

      const isLocked = vSlot.choiceMove && vSlot.choiceMove.name !== m.name;
      const isAV = vSlot.item === 'assault_vest' && m.category === '변화';
      const disabled = isLocked || isAV || isOutOfPP;
      
      let note = '';
      if (isOutOfPP) note = 'PP 0 소진';
      else if (isLocked) note = '구애 고정';
      else if (isAV) note = '돌격조끼';

      // Standard move option
      candidates.push({
        key: `move_${i + 1}`,
        label: `${i + 1}. ${m.name}`,
        ppText: `PP ${currentPP}/${maxPP}`,
        subtext: isOutOfPP ? 'PP 소진 (사용 불가)' : `${i + 1} 또는 ${m.name}`,
        tag: isOutOfPP ? '소진' : m.type,
        tagClass: isOutOfPP ? 'badge-tag' : `type-${m.type}`,
        disabled: disabled,
        note: note,
        powerAcc: m.category === '변화' ? '변화기' : `위력 ${m.power} / 명중 ${m.acc}%`
      });

      // Mega move option (if available or has votes)
      if (canMega || pokeVoteCounts[`mega_${i + 1}`]) {
        candidates.push({
          key: `mega_${i + 1}`,
          label: `🧬 [MEGA] ${m.name}`,
          ppText: `PP ${currentPP}/${maxPP}`,
          subtext: isOutOfPP ? 'PP 소진 (사용 불가)' : `메가${i + 1} 또는 MEGA ${i + 1}`,
          tag: isOutOfPP ? '소진' : '메가진화',
          tagClass: isOutOfPP ? 'badge-tag' : 'badge-tag',
          disabled: disabled,
          note: note,
          isMega: true,
          powerAcc: m.category === '변화' ? '변화기' : `위력 ${m.power} / 명중 ${m.acc}%`
        });
      }
    });
  }

  // Switch Candidates (if 3v3 mode)
  if (pokeBattleMode === '3v3') {
    let switchCounter = 5;
    for (let i = 0; i < 3; i++) {
      if (i !== viewersActiveIdx) {
        const slot = viewersTeam[i];
        const slotNum = i + 1;
        const isFainted = slot.fainted || slot.currentHP <= 0;
        candidates.push({
          key: `switch_${switchCounter}`,
          label: `${switchCounter}. [🔄 ${slotNum}번 교체] ${slot.pokemon.name}`,
          ppText: isFainted ? '💀 기절' : `HP ${slot.currentHP}/${slot.maxHP}`,
          subtext: isFainted ? '기절하여 교체 불가' : `${switchCounter} 또는 ${slotNum}번 / ${slot.pokemon.name}`,
          tag: isFainted ? '기절' : `HP ${Math.round((slot.currentHP/slot.maxHP)*100)}%`,
          tagClass: isFainted ? 'badge-tag' : 'type-노말',
          disabled: isFainted,
          targetIdx: i,
          isSwitch: true
        });
        switchCounter++;
      }
    }
  }

  container.innerHTML = candidates.map(c => {
    const count = pokeVoteCounts[c.key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isWinning = isReveal && winningKey === c.key && count > 0;
    const cardBorder = isWinning ? '1.5px solid #00ffa3' : (c.disabled ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.08)');
    const cardBg = isWinning ? 'rgba(0, 255, 163, 0.18)' : (c.disabled ? 'rgba(15, 23, 42, 0.35)' : 'rgba(15, 23, 42, 0.7)');

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; border-radius: 8px; border: ${cardBorder}; background: ${cardBg}; opacity: ${c.disabled ? '0.45' : '1'}; transition: all 0.2s;">
        <!-- Left: Large Label & High-contrast Chat Guide -->
        <div style="flex: 0 0 200px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 900; color: ${c.isMega ? '#00ffa3' : (c.disabled ? '#94a3b8' : '#fff')}; font-size: 13.5px; letter-spacing: -0.2px;">${c.label}</span>
            <span class="type-badge ${c.tagClass}" style="font-size: 9px; padding: 1px 5px; font-weight: 800;">${c.tag}</span>
            ${c.ppText ? `<span style="font-size: 9px; color: #ffd700; font-weight: 800; background: rgba(0,0,0,0.4); padding: 1px 4px; border-radius: 4px;">${c.ppText}</span>` : ''}
            ${c.note ? `<span style="font-size: 9px; color: #f87171; font-weight: 800;">[${c.note}]</span>` : ''}
          </div>
          <div style="font-size: 11.5px; color: ${c.disabled ? '#64748b' : '#38bdf8'}; font-weight: 700; margin-top: 2px;">
            💬 채팅: <b>${c.subtext}</b>
          </div>
        </div>

        <!-- Middle: Progress Bar (Blind Mask vs Revealed) -->
        <div style="flex: 1; height: 12px; background: rgba(0,0,0,0.5); border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); position: relative;">
          ${!isReveal ? `
            <div style="height: 100%; width: 100%; background: linear-gradient(90deg, rgba(56, 189, 248, 0.08), rgba(0, 255, 163, 0.2), rgba(56, 189, 248, 0.08)); background-size: 200% 100%; animation: votePulse 2s infinite linear; border-radius: 5px;"></div>
          ` : `
            <div style="height: 100%; width: ${pct}%; background: ${isWinning ? 'linear-gradient(90deg, #ffd700, #00ffa3)' : (c.isMega ? 'linear-gradient(90deg, #ec4899, #00ffa3)' : 'linear-gradient(90deg, #38bdf8, #00ffa3)')}; border-radius: 5px; transition: width 0.4s ease-out;"></div>
          `}
        </div>

        <!-- Right: Votes count (Blind vs Revealed) -->
        <div style="flex: 0 0 95px; text-align: right; white-space: nowrap;">
          ${!isReveal ? `
            <span style="font-size: 11px; color: #94a3b8; font-weight: 700; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">🔒 집계 중...</span>
          ` : `
            <span style="font-size: 11.5px; color: ${isWinning ? '#ffd700' : '#cbd5e1'}; font-weight: 900;">${count}표 (${pct}%) ${isWinning ? '👑' : ''}</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// --- Turn Sequence Execution (Switching Priority +6 & Attack Ordering) ---
async function executeBattleTurnSequence() {
  pokeBattleState.phase = 'executing';
  document.getElementById('arenaViewersVoteHud').style.display = 'none';

  const sAct = pokeBattleState.streamerAction;
  const vAct = pokeBattleState.viewersAction;

  // 1. Handle Switches First (Priority +6, including Stealth Rock entry KO check)
  let switchFainted = false;
  if (sAct.type === 'switch') {
    if (await executeSwitchAnimation('streamer', sAct.targetIdx)) switchFainted = true;
  }
  if (vAct.type === 'switch') {
    if (await executeSwitchAnimation('viewers', vAct.targetIdx)) switchFainted = true;
  }

  if (switchFainted) {
    await checkAndResolveTurnFaints();
    return;
  }

  // If both switched, round ends immediately
  if (sAct.type === 'switch' && vAct.type === 'switch') {
    await handleRoundEndEffects();
    return;
  }

  // Always grab current active slots after any switches!
  const sSlot = streamerTeam[streamerActiveIdx];
  const vSlot = viewersTeam[viewersActiveIdx];

  function getEffectiveBattleSpeed(slot) {
    if (!slot || !slot.pokemon) return 100;
    let spe = calculateLevel50Stat(slot.pokemon.stats.spe);
    spe = Math.floor(spe * getRankMultiplier(slot.rankSpe || 0));
    if (slot.item === 'choice_scarf') spe = Math.floor(spe * 1.5);
    if (slot.item === 'iron_ball') spe = Math.floor(spe * 0.5);
    if (slot.status === 'par') spe = Math.floor(spe * 0.5);
    return Math.max(1, spe);
  }

  // 2. Pre-Move Mega Evolution Phase (최우선 메가진화 발동 단계)
  // 공식 룰: 교체 후, 일반 공격 기술이 나가기 전에 메가진화 연출이 우선 발생.
  // 양쪽 플레이어가 모두 메가진화를 선택했다면 메가진화 전 원래 스피드 순서대로 연출 진행.
  const streamerWantsMega = sAct && sAct.type === 'move' && sAct.isMega && !sSlot.isMega;
  const viewersWantsMega = vAct && vAct.type === 'move' && vAct.isMega && !vSlot.isMega;

  if (streamerWantsMega && viewersWantsMega) {
    const sPreSpeed = getEffectiveBattleSpeed(sSlot);
    const vPreSpeed = getEffectiveBattleSpeed(vSlot);
    const streamerMegaFirst = sPreSpeed > vPreSpeed ? true : (vPreSpeed > sPreSpeed ? false : Math.random() < 0.5);
    if (streamerMegaFirst) {
      await executeMegaEvolution('streamer');
      await battleSleep(250);
      await executeMegaEvolution('viewers');
    } else {
      await executeMegaEvolution('viewers');
      await battleSleep(250);
      await executeMegaEvolution('streamer');
    }
    await battleSleep(200);
  } else if (streamerWantsMega) {
    await executeMegaEvolution('streamer');
    await battleSleep(200);
  } else if (viewersWantsMega) {
    await executeMegaEvolution('viewers');
    await battleSleep(200);
  }

  // 3. Move Execution Phase (기술 실행 단계 - 메가진화 완료 후 스피드 및 기술 우선도로 선후공 판정)
  if (sAct.type === 'move' && vAct.type === 'move') {
    const sMove = sAct.move;
    const vMove = vAct.move;

    function getMovePriority(m) {
      if (!m) return 0;
      if (typeof m.priority === 'number') return m.priority;
      if (m.name === '속이다') return 3;
      if (m.name === '신속') return 2;
      if (m.name === '전광석화' || m.name === '야습' || m.name === '기습' || m.name === '불릿펀치' || m.name === '얼음뭉치' || m.name === '그래스슬라이더') return 1;
      return 0;
    }

    const sPriority = getMovePriority(sMove);
    const vPriority = getMovePriority(vMove);

    // 메가진화 완료 후의 현재 최신 스피드로 행동 순서 계산 (7세대 공식 개정 룰)
    const sSpeed = getEffectiveBattleSpeed(sSlot);
    const vSpeed = getEffectiveBattleSpeed(vSlot);

    // 선제공격손톱 (quick_claw: 20% 확률로 동일 우선도 내 선공)
    const sQuickClaw = sSlot.item === 'quick_claw' && Math.random() < 0.2;
    const vQuickClaw = vSlot.item === 'quick_claw' && Math.random() < 0.2;

    let streamerFirst = true;
    if (sPriority > vPriority) streamerFirst = true;
    else if (vPriority > sPriority) streamerFirst = false;
    else if (sQuickClaw && !vQuickClaw) streamerFirst = true;
    else if (vQuickClaw && !sQuickClaw) streamerFirst = false;
    else if (sSpeed > vSpeed) streamerFirst = true;
    else if (vSpeed > sSpeed) streamerFirst = false;
    else streamerFirst = Math.random() < 0.5; // 공식 룰: 동스피드 50% 난수 결정

    const firstActor = streamerFirst ? 'streamer' : 'viewers';
    const secondActor = streamerFirst ? 'viewers' : 'streamer';
    const firstAct = streamerFirst ? sAct : vAct;
    const secondAct = streamerFirst ? vAct : sAct;

    // Attack 1 (isSecondMover = false)
    const firstFainted = await executeSingleAttack(firstActor, firstAct.move, false, false);
    if (firstFainted) {
      await checkAndResolveTurnFaints();
      return;
    }

    await battleSleep(280);

    // Attack 2 (isSecondMover = true -> enables 포커스렌즈/Zoom Lens accuracy bonus)
    const secondFainted = await executeSingleAttack(secondActor, secondAct.move, false, true);
    if (secondFainted) {
      await checkAndResolveTurnFaints();
      return;
    }
  } else if (sAct.type === 'move' && vAct.type === 'switch') {
    // Target switched this turn before attacker moved -> target has already acted (Zoom Lens active)
    const fainted = await executeSingleAttack('streamer', sAct.move, false, true);
    if (fainted) {
      await checkAndResolveTurnFaints();
      return;
    }
  } else if (sAct.type === 'switch' && vAct.type === 'move') {
    const fainted = await executeSingleAttack('viewers', vAct.move, false, true);
    if (fainted) {
      await checkAndResolveTurnFaints();
      return;
    }
  }

  await handleRoundEndEffects();
}

async function executeMegaEvolution(actor) {
  const isStreamer = actor === 'streamer';
  const team = isStreamer ? streamerTeam : viewersTeam;
  const activeIdx = isStreamer ? streamerActiveIdx : viewersActiveIdx;
  const slot = team[activeIdx];
  slot.pokemon = JSON.parse(JSON.stringify(slot.pokemon));
  const poke = slot.pokemon;
  const megaForm = getAvailableMegaEvolution(poke, slot.item);
  if (!megaForm) return;

  const teamName = escapeHtml(isStreamer ? getStreamerName() : '시청자 연합');
  const stoneObj = getItemObj(slot.item);

  if (isStreamer) streamerTeamHasMegaEvolved = true;
  else viewersTeamHasMegaEvolved = true;
  slot.isMega = true;

  // Arena Flash & Aura
  const stage = document.getElementById('pokeBattleArenaStage');
  if (stage) {
    stage.classList.add('mega-flash');
    setTimeout(() => stage.classList.remove('mega-flash'), 450);
  }

  setBattleDialogue(`🧬 <b>[${teamName}]</b>의 <b>${poke.name}</b>의 <b>[${stoneObj.name}]</b>이(가) 트레이너의 마음에 반응했다!<br>✨ <b>${megaForm.nameKo}</b>(으)로 <b>메가진화(MEGA EVOLUTION)</b>!`);

  // Update Poke stats and types (공식 룰: 메가진화 시 HP 종족값은 변하지 않음)
  const oldMaxHP = slot.maxHP;
  poke.name = megaForm.nameKo;
  poke.types = megaForm.types;
  poke.stats = megaForm.stats;
  poke.sprite_front = megaForm.frontSprite;
  poke.sprite_back = megaForm.backSprite;

  const newMaxHP = calculateLevel50HP(megaForm.stats.hp || 80);
  const hpDiff = newMaxHP - oldMaxHP;
  slot.maxHP = newMaxHP;
  slot.currentHP = Math.min(slot.maxHP, slot.currentHP + Math.max(0, hpDiff));

  updateArenaActivePokemonUI();
  updateArenaHPBars();

  // Re-apply Mega Evolution glow animation AFTER updateArenaActivePokemonUI so it isn't prematurely cleared
  const spr = isStreamer ? document.getElementById('arenaStreamerSprite') : document.getElementById('arenaViewersSprite');
  if (spr) {
    spr.style.filter = 'brightness(3) drop-shadow(0 0 25px #00ffa3)';
    spr.style.transform = 'scale(1.25)';
    setTimeout(() => {
      spr.src = isStreamer ? (megaForm.backSprite || megaForm.frontSprite) : megaForm.frontSprite;
      spr.style.filter = 'none';
      spr.style.transform = 'scale(1)';
    }, 300);
  }

  const itemBadge = document.getElementById(isStreamer ? 'arenaStreamerItemBadge' : 'arenaViewersItemBadge');
  if (itemBadge) {
    itemBadge.innerHTML = `<span class="mega-tag-badge">🧬 MEGA</span> ${stoneObj.name}`;
  }

  await battleSleep(450);
}

async function applyStealthRockOnEntry(side) {
  const isStreamer = side === 'streamer';
  const hasRock = isStreamer ? pokeBattleState.stealthRockStreamer : pokeBattleState.stealthRockViewers;
  const slot = isStreamer ? streamerTeam[streamerActiveIdx] : viewersTeam[viewersActiveIdx];
  if (!hasRock || !slot || !slot.pokemon || slot.fainted || slot.currentHP <= 0) return false;
  if (slot.item === 'heavy_duty_boots') return false;

  const poke = slot.pokemon;
  let rockMult = 1.0;
  poke.types.forEach(t => {
    if (pokeTypeChart['바위'] && pokeTypeChart['바위'][t] !== undefined) {
      rockMult *= pokeTypeChart['바위'][t];
    }
  });
  if (rockMult <= 0) return false;

  const srDmg = Math.max(1, Math.floor((slot.maxHP * rockMult) / 8));
  const prevHP = slot.currentHP;
  slot.currentHP = Math.max(0, prevHP - srDmg);
  const dealt = prevHP - slot.currentHP;
  updateArenaHPBars();

  if (isStreamer && dealt > 0) {
    const damagePercent = (dealt / slot.maxHP) * 100.0;
    const currentHpPct = (slot.currentHP / slot.maxHP) * 100.0;
    triggerHapticDamage(damagePercent, currentHpPct, false);
  }

  setBattleDialogue(`🪨 <b>${escapeHtml(poke.name)}</b>에게 날카로운 바위가 박혔다! (-${srDmg})`);
  await battleSleep(240);
  await checkAndTriggerBerryHeal(slot, poke);

  if (slot.currentHP <= 0) {
    slot.currentHP = 0;
    slot.fainted = true;
    const spr = document.getElementById(isStreamer ? 'arenaStreamerSprite' : 'arenaViewersSprite');
    if (spr) spr.classList.add('poke-sprite-fainted');
    renderArenaTeamBallsHUD();
    if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('faint.wav');
    await battleSleep(320);
    setBattleDialogue(`💀 <b>${escapeHtml(poke.name)}</b>은(는) 스텔스록 데미지로 쓰러졌다!`);
    const otherSlot = isStreamer ? viewersTeam[viewersActiveIdx] : streamerTeam[streamerActiveIdx];
    if (otherSlot && !otherSlot.fainted && otherSlot.currentHP > 0) {
      lastDoubleKoWinner = isStreamer ? 'viewers' : 'streamer';
    }
    return true;
  }
  updateArenaBattleBadges();
  return false;
}

async function executeSwitchAnimation(side, targetIdx) {
  const isStreamer = side === 'streamer';
  if (isStreamer) {
    resetSlotBattleModifiers(streamerTeam[streamerActiveIdx]);
    streamerActiveIdx = targetIdx;
  } else {
    resetSlotBattleModifiers(viewersTeam[viewersActiveIdx]);
    viewersActiveIdx = targetIdx;
  }

  const slot = isStreamer ? streamerTeam[targetIdx] : viewersTeam[targetIdx];
  const p = slot.pokemon;
  const label = isStreamer ? `👑 <b>[${escapeHtml(getStreamerName())}]</b>` : '👥 <b>시청자 연합</b>';
  setBattleDialogue(`${label}은(는) <b>[${escapeHtml(p.name)}]</b>(으)로 교체했다!`);
  updateArenaActivePokemonUI();
  renderArenaTeamBallsHUD();
  updateArenaHPBars();

  const spr = document.getElementById(isStreamer ? 'arenaStreamerSprite' : 'arenaViewersSprite');
  if (spr) {
    spr.style.transform = 'scale(0.5)';
    setTimeout(() => { spr.style.transform = 'scale(1)'; }, 200);
  }
  await battleSleep(300);
  return await applyStealthRockOnEntry(side);
}

let lastDoubleKoWinner = null;

async function checkAndTriggerBerryHeal(slot, poke) {
  if (!slot || slot.currentHP <= 0 || slot.itemUsed) return;
  if (slot.item === 'sitrus_berry' && slot.currentHP <= slot.maxHP * 0.5) {
    const heal = Math.max(1, Math.floor(slot.maxHP * 0.25));
    slot.currentHP = Math.min(slot.maxHP, slot.currentHP + heal);
    slot.itemUsed = true;
    updateArenaHPBars();
    setBattleDialogue(`🍋 <b>${poke.name}</b>은(는) 자뭉열매를 먹고 ${heal} HP를 회복했다!`);
    await battleSleep(260);
  } else if (slot.item === 'oran_berry' && slot.currentHP <= slot.maxHP * 0.5) {
    const heal = Math.min(10, slot.maxHP - slot.currentHP);
    if (heal > 0) {
      slot.currentHP += heal;
      slot.itemUsed = true;
      updateArenaHPBars();
      setBattleDialogue(`🍒 <b>${poke.name}</b>은(는) 오랭열매를 먹고 ${heal} HP를 회복했다!`);
      await battleSleep(260);
    }
  }
}

async function checkAndTriggerWhiteHerb(slot, poke) {
  if (!slot || slot.item !== 'white_herb' || slot.itemUsed) return;
  if ((slot.rankAtk || 0) < 0 || (slot.rankDef || 0) < 0 || (slot.rankSpA || 0) < 0 || (slot.rankSpD || 0) < 0 || (slot.rankSpe || 0) < 0) {
    slot.rankAtk = Math.max(0, slot.rankAtk || 0);
    slot.rankDef = Math.max(0, slot.rankDef || 0);
    slot.rankSpA = Math.max(0, slot.rankSpA || 0);
    slot.rankSpD = Math.max(0, slot.rankSpD || 0);
    slot.rankSpe = Math.max(0, slot.rankSpe || 0);
    slot.itemUsed = true;
    setBattleDialogue(`🌿 <b>${poke.name}</b>은(는) <b>하양허브</b>로 떨어진 능력을 원래대로 되돌렸다!`);
    await battleSleep(250);
  }
}

async function checkAndTriggerStatusBerry(slot, poke) {
  if (!slot || !slot.status || slot.itemUsed) return;
  const st = slot.status;
  if (
    slot.item === 'lum_berry' ||
    (slot.item === 'cheri_berry' && st === 'par') ||
    (slot.item === 'rawst_berry' && st === 'brn') ||
    (slot.item === 'pecha_berry' && st === 'tox')
  ) {
    const berryObj = getItemObj(slot.item);
    slot.status = null;
    slot.toxicCounter = 0;
    slot.itemUsed = true;
    setBattleDialogue(`🍒 <b>${poke.name}</b>은(는) <b>${berryObj.name}</b>을(를) 먹고 상태 이상을 회복했다!`);
    await battleSleep(250);
  }
}

async function executeSingleAttack(actor, move, isMega = false, isSecondMover = false) {
  const isStreamer = actor === 'streamer';
  const attackerSlot = isStreamer ? streamerTeam[streamerActiveIdx] : viewersTeam[viewersActiveIdx];
  const defenderSlot = isStreamer ? viewersTeam[viewersActiveIdx] : streamerTeam[streamerActiveIdx];

  // Handle Mega Evolution first in the exact same turn!
  if (isMega && !attackerSlot.isMega) {
    await executeMegaEvolution(actor);
  }

  const attacker = attackerSlot.pokemon;
  const defender = defenderSlot.pokemon;
  const attackerSpr = isStreamer ? document.getElementById('arenaStreamerSprite') : document.getElementById('arenaViewersSprite');
  const defenderSpr = isStreamer ? document.getElementById('arenaViewersSprite') : document.getElementById('arenaStreamerSprite');

  // Reset attacker's previous Destiny Bond when acting again
  attackerSlot.destinyBond = false;

  // Paralysis full-paralysis check (25% chance unable to move)
  if (attackerSlot.status === 'par' && Math.random() < 0.25) {
    setBattleDialogue(`⚡ <b>${attacker.name}</b>은(는) 몸이 저려서 움직일 수 없다!`);
    await battleSleep(350);
    return false;
  }

  // Choice Item Lock
  if (attackerSlot.item === 'choice_band' || attackerSlot.item === 'choice_specs' || attackerSlot.item === 'choice_scarf') {
    attackerSlot.choiceMove = move;
  }

  // PP Deduction & Struggle Check
  const isStruggle = move.isStruggle || move.name === '발버둥';
  let ppRemainingText = '';
  if (!isStruggle) {
    const ppObj = attackerSlot.movesPP ? attackerSlot.movesPP.find(x => x.name === move.name) : null;
    if (ppObj) {
      ppObj.currentPP = Math.max(0, ppObj.currentPP - 1);
      ppRemainingText = `<span style="font-size: 11px; color: ${ppObj.currentPP <= 2 ? '#f87171' : '#ffd700'};">(남은 PP: ${ppObj.currentPP}/${ppObj.maxPP})</span>`;
      // 과사열매 (leppa_berry): PP 0 도달 시 10 회복
      if (ppObj.currentPP === 0 && attackerSlot.item === 'leppa_berry' && !attackerSlot.itemUsed) {
        ppObj.currentPP = Math.min(ppObj.maxPP, 10);
        attackerSlot.itemUsed = true;
      }
    }
  }

  // 1. Announce attack
  setBattleDialogue(`${isStreamer ? '👑' : '👥'} <b>${attacker.name}</b>의 <b>[${move.name}]</b>! ${ppRemainingText}`);
  if (attackerSpr) {
    attackerSpr.classList.add('poke-sprite-attacker');
    setTimeout(() => attackerSpr.classList.remove('poke-sprite-attacker'), 350);
  }

  await battleSleep(180);

  // 2. Accuracy check (Struggle & 파동탄 never miss; apply Wide Lens / Zoom Lens / Bright Powder)
  let effectiveAcc = move.acc || 100;
  if (attackerSlot.item === 'wide_lens') effectiveAcc *= 1.1;
  else if (attackerSlot.item === 'zoom_lens' && isSecondMover) effectiveAcc *= 1.2;
  if (defenderSlot.item === 'bright_powder') effectiveAcc *= 0.9;

  const hit = isStruggle || move.name === '파동탄' || (Math.random() * 100 <= effectiveAcc);
  if (!hit) {
    if (typeof playPokeMoveAnimation === 'function') {
      await playPokeMoveAnimation(actor, move.name, { hit: false, isCrit: false, typeMult: 1.0 });
    }
    setBattleDialogue(`💨 하지만 <b>[${attacker.name}]</b>의 공격은 빗나갔다!`);
    await battleSleep(360);
    // 무릎차기 (High Jump Kick) 빗나감 반동: 최대 HP의 50%
    if (move.name === '무릎차기' && attackerSlot.currentHP > 0) {
      const crashDmg = Math.max(1, Math.floor(attackerSlot.maxHP * 0.5));
      attackerSlot.currentHP = Math.max(0, attackerSlot.currentHP - crashDmg);
      updateArenaHPBars();
      setBattleDialogue(`💥 <b>${attacker.name}</b>은(는) 기세 좋게 땅에 부딪혀 큰 데미지를 입었다! (-${crashDmg})`);
      await battleSleep(280);
      if (attackerSlot.currentHP <= 0) {
        attackerSlot.fainted = true;
        if (attackerSpr) attackerSpr.classList.add('poke-sprite-fainted');
        renderArenaTeamBallsHUD();
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('faint.wav');
        await battleSleep(320);
        setBattleDialogue(`💀 <b>${attacker.name}</b>은(는) 쓰러졌다!`);
        return true;
      }
    }
    return false;
  }

  // 3. Status / Buff / Recovery / Hazard moves (15종 공식 효과 구현)
  if (!isStruggle && (move.category === '변화' || move.power === 0)) {
    if (typeof playPokeMoveAnimation === 'function') {
      await playPokeMoveAnimation(actor, move.name, { hit: true, isCrit: false, typeMult: 1.0 });
    }
    const mName = move.name;
    if (mName === '날개쉬기' || mName === '달의불빛') {
      const heal = Math.max(1, Math.floor(attackerSlot.maxHP * 0.5));
      attackerSlot.currentHP = Math.min(attackerSlot.maxHP, attackerSlot.currentHP + heal);
      updateArenaHPBars();
      setBattleDialogue(`💚 <b>${attacker.name}</b>은(는) <b>[${mName}]</b>(으)로 체력을 회복했다! (+${heal})`);
    } else if (mName === '칼춤') {
      attackerSlot.rankAtk = clampRank((attackerSlot.rankAtk || 0) + 2);
      setBattleDialogue(`⚔️ <b>${attacker.name}</b>의 공격이 크게 올라갔다! (+2랭크)`);
    } else if (mName === '철벽') {
      attackerSlot.rankDef = clampRank((attackerSlot.rankDef || 0) + 2);
      setBattleDialogue(`🛡️ <b>${attacker.name}</b>의 방어가 크게 올라갔다! (+2랭크)`);
    } else if (mName === '록커트') {
      attackerSlot.rankSpe = clampRank((attackerSlot.rankSpe || 0) + 2);
      setBattleDialogue(`⚡ <b>${attacker.name}</b>의 스피드가 크게 올라갔다! (+2랭크)`);
    } else if (mName === '용의춤') {
      attackerSlot.rankAtk = clampRank((attackerSlot.rankAtk || 0) + 1);
      attackerSlot.rankSpe = clampRank((attackerSlot.rankSpe || 0) + 1);
      setBattleDialogue(`🐉 <b>${attacker.name}</b>의 공격과 스피드가 올라갔다! (+1랭크)`);
    } else if (mName === '벌크업') {
      attackerSlot.rankAtk = clampRank((attackerSlot.rankAtk || 0) + 1);
      attackerSlot.rankDef = clampRank((attackerSlot.rankDef || 0) + 1);
      setBattleDialogue(`💪 <b>${attacker.name}</b>의 공격과 방어가 올라갔다! (+1랭크)`);
    } else if (mName === '명상') {
      attackerSlot.rankSpA = clampRank((attackerSlot.rankSpA || 0) + 1);
      attackerSlot.rankSpD = clampRank((attackerSlot.rankSpD || 0) + 1);
      setBattleDialogue(`🔮 <b>${attacker.name}</b>의 특수공격과 특수방어가 올라갔다! (+1랭크)`);
    } else if (mName === '나비춤') {
      attackerSlot.rankSpA = clampRank((attackerSlot.rankSpA || 0) + 1);
      attackerSlot.rankSpD = clampRank((attackerSlot.rankSpD || 0) + 1);
      attackerSlot.rankSpe = clampRank((attackerSlot.rankSpe || 0) + 1);
      setBattleDialogue(`🦋 <b>${attacker.name}</b>의 특수공격·특수방어·스피드가 올라갔다! (+1랭크)`);
    } else if (mName === '껍질깨기') {
      attackerSlot.rankAtk = clampRank((attackerSlot.rankAtk || 0) + 2);
      attackerSlot.rankSpA = clampRank((attackerSlot.rankSpA || 0) + 2);
      attackerSlot.rankSpe = clampRank((attackerSlot.rankSpe || 0) + 2);
      attackerSlot.rankDef = clampRank((attackerSlot.rankDef || 0) - 1);
      attackerSlot.rankSpD = clampRank((attackerSlot.rankSpD || 0) - 1);
      setBattleDialogue(`🐚 <b>${attacker.name}</b>은(는) 껍질을 깨서 방어/특방을 깎고 공격·특공·스피드를 크게 올렸다!`);
      await checkAndTriggerWhiteHerb(attackerSlot, attacker);
    } else if (mName === '도깨비불') {
      if (defender.types.includes('불꽃') || defenderSlot.status) {
        setBattleDialogue(`💨 하지만 <b>${defender.name}</b>에게는 효과가 없었다!`);
      } else {
        defenderSlot.status = 'brn';
        setBattleDialogue(`🔥 <b>${defender.name}</b>은(는) 화상을 입었다! (물리 공격력 반감 & 매 턴 피해)`);
        await checkAndTriggerStatusBerry(defenderSlot, defender);
      }
    } else if (mName === '전기자석파') {
      if (defender.types.includes('전기') || defender.types.includes('땅') || defenderSlot.status) {
        setBattleDialogue(`💨 하지만 <b>${defender.name}</b>에게는 효과가 없었다!`);
      } else {
        defenderSlot.status = 'par';
        setBattleDialogue(`⚡ <b>${defender.name}</b>은(는) 마비되어 스피드가 떨어지고 몸이 저리게 되었다!`);
        await checkAndTriggerStatusBerry(defenderSlot, defender);
      }
    } else if (mName === '맹독') {
      if (defender.types.includes('독') || defender.types.includes('강철') || defenderSlot.status) {
        setBattleDialogue(`💨 하지만 <b>${defender.name}</b>에게는 효과가 없었다!`);
      } else {
        defenderSlot.status = 'tox';
        defenderSlot.toxicCounter = 1;
        setBattleDialogue(`☠️ <b>${defender.name}</b>은(는) 맹독에 걸렸다!`);
        await checkAndTriggerStatusBerry(defenderSlot, defender);
      }
    } else if (mName === '스텔스록') {
      if (isStreamer) pokeBattleState.stealthRockViewers = true;
      else pokeBattleState.stealthRockStreamer = true;
      setBattleDialogue(`🪨 상대 진영 주변에 날카로운 바위가 떠다니기 시작했다!`);
    } else if (mName === '길동무') {
      attackerSlot.destinyBond = true;
      setBattleDialogue(`👻 <b>${attacker.name}</b>은(는) 상대를 길동무로 삼으려 하고 있다!`);
    } else {
      attackerSlot.rankAtk = clampRank((attackerSlot.rankAtk || 0) + 1);
      attackerSlot.rankSpA = clampRank((attackerSlot.rankSpA || 0) + 1);
      setBattleDialogue(`✨ <b>${attacker.name}</b>의 공격력과 특수공격력이 상승했다!`);
    }
    updateArenaBattleBadges();
    await battleSleep(320);
    return false;
  }

  // 4. Damage calculation (공식 Lv.50 실능치 및 랭크·급소 규칙 적용)
  const isSpecial = move.category === '특수';
  const isBodyPress = move.name === '바디프레스';
  const isPsyshock = move.name === '사이코쇼크';

  // Critical Hit
  const highCritMoves = new Set(['스톤에지', '섀도크루', '리프블레이드', '깜짝베기', '크로스촙']);
  let critStage = (attackerSlot.item === 'scope_lens' ? 1 : 0) + (highCritMoves.has(move.name) ? 1 : 0);
  const critChance = critStage >= 2 ? 0.5 : (critStage === 1 ? 0.125 : 0.0625);
  const isCrit = !isStruggle && (Math.random() < critChance);
  const critMult = isCrit ? 1.5 : 1.0;

  // Base -> Lv.50 Real Stat
  const rawAtkBase = isBodyPress ? attacker.stats.def : (isSpecial ? attacker.stats.spa : attacker.stats.atk);
  const rawDefBase = (isSpecial && !isPsyshock) ? defender.stats.spd : defender.stats.def;
  let atkStat = calculateLevel50Stat(rawAtkBase);
  let defStat = calculateLevel50Stat(rawDefBase);

  // Stat Ranks (공식 급소 룰: 급소 시 공격 측의 랭크 하락 무시, 방어 측의 랭크 상승 무시)
  let atkRank = isBodyPress ? (attackerSlot.rankDef || 0) : (isSpecial ? (attackerSlot.rankSpA || 0) : (attackerSlot.rankAtk || 0));
  let defRank = (isSpecial && !isPsyshock) ? (defenderSlot.rankSpD || 0) : (defenderSlot.rankDef || 0);
  if (isCrit) {
    if (atkRank < 0) atkRank = 0;
    if (defRank > 0) defRank = 0;
  }
  atkStat = Math.floor(atkStat * getRankMultiplier(atkRank));
  defStat = Math.floor(defStat * getRankMultiplier(defRank));

  // Item offensive buffs
  if (!isSpecial && attackerSlot.item === 'choice_band') atkStat = Math.floor(atkStat * 1.5);
  if (isSpecial && attackerSlot.item === 'choice_specs') atkStat = Math.floor(atkStat * 1.5);
  if (attackerSlot.item === 'light_ball' && attacker.name.includes('피카츄')) atkStat = Math.floor(atkStat * 2.0);

  // Item defensive buffs
  if (isSpecial && !isPsyshock && defenderSlot.item === 'assault_vest') defStat = Math.floor(defStat * 1.5);
  if (defenderSlot.item === 'eviolite' && EVIOLITE_ELIGIBLE_POKEMONS.has(defender.name)) {
    defStat = Math.floor(defStat * 1.5);
  }

  // 화상(Burn) 상태 시 물리 기술 데미지 0.5배
  const burnMult = (!isSpecial && !isStruggle && attackerSlot.status === 'brn') ? 0.5 : 1.0;

  // STAB (자속 보정)
  const stab = (!isStruggle && attacker.types.includes(move.type)) ? 1.5 : 1.0;

  // Type Effectiveness (Struggle deals neutral damage; 검은철구 착용 시 비행 타입도 땅 기술 피격)
  let typeMult = 1.0;
  if (!isStruggle) {
    defender.types.forEach(defType => {
      if (move.type === '땅' && defType === '비행' && defenderSlot.item === 'iron_ball') {
        typeMult *= 1.0;
      } else if (pokeTypeChart[move.type] && pokeTypeChart[move.type][defType] !== undefined) {
        typeMult *= pokeTypeChart[move.type][defType];
      }
    });
  }

  // 🎈 풍선 (Air Balloon): 땅 타입 무효화 (검은철구가 아닐 때)
  if (!isStruggle && move.type === '땅' && defenderSlot.item === 'air_balloon') {
    typeMult = 0;
    setBattleDialogue(`🎈 <b>${defender.name}</b>은(는) <b>풍선</b>으로 공중에 떠 있어서 땅 타입 공격이 닿지 않았다!`);
  }

  if (isCrit && typeMult > 0) pokeBattleState.stats.crits++;
  if (typeMult >= 2.0) pokeBattleState.stats.superEffective++;

  // Item Damage Modifiers
  let itemDmgMult = 1.0;
  if (attackerSlot.item === 'life_orb') itemDmgMult *= 1.3;
  if (!isStruggle && attackerSlot.item === 'expert_belt' && typeMult >= 2.0) itemDmgMult *= 1.2;
  if (!isSpecial && attackerSlot.item === 'muscle_band') itemDmgMult *= 1.1;
  if (isSpecial && attackerSlot.item === 'wise_glasses') itemDmgMult *= 1.1;
  if (attackerSlot.item === 'punching_glove' && move.name.includes('펀치')) itemDmgMult *= 1.1;

  // 속성 강화 도구 & 플레이트 (1.2배)
  const typeBoostItems = {
    '노말': ['silk_scarf'],
    '불꽃': ['charcoal', 'flame_plate'],
    '물': ['mystic_water', 'splash_plate'],
    '전기': ['magnet', 'zap_plate'],
    '풀': ['miracle_seed', 'meadow_plate'],
    '얼음': ['never_melt_ice', 'icicle_plate'],
    '격투': ['black_belt', 'fist_plate'],
    '독': ['poison_barb', 'toxic_plate'],
    '땅': ['soft_sand', 'earth_plate'],
    '비행': ['sharp_beak', 'sky_plate'],
    '에스퍼': ['twisted_spoon', 'mind_plate'],
    '벌레': ['silver_powder', 'insect_plate'],
    '바위': ['hard_stone', 'stone_plate'],
    '고스트': ['spell_tag', 'spooky_plate'],
    '드래곤': ['dragon_fang', 'draco_plate'],
    '악': ['black_glasses', 'dread_plate'],
    '강철': ['metal_coat', 'iron_plate'],
    '페어리': ['fairy_feather', 'pixie_plate']
  };
  if (!isStruggle && attackerSlot.item && typeBoostItems[move.type] && typeBoostItems[move.type].includes(attackerSlot.item)) {
    itemDmgMult *= 1.2;
  }

  // 💎 18종 속성별 주얼 (Type Gem): 해당 속성 기술 1회 한정 1.3배 부스트 후 소모
  const typeToGemMap = {
    '노말': 'normal_gem', '불꽃': 'fire_gem', '물': 'water_gem', '전기': 'electric_gem',
    '풀': 'grass_gem', '얼음': 'ice_gem', '격투': 'fighting_gem', '독': 'poison_gem',
    '땅': 'ground_gem', '비행': 'flying_gem', '에스퍼': 'psychic_gem', '벌레': 'bug_gem',
    '바위': 'rock_gem', '고스트': 'ghost_gem', '드래곤': 'dragon_gem', '악': 'dark_gem',
    '강철': 'steel_gem', '페어리': 'fairy_gem'
  };
  if (!isStruggle && typeMult > 0 && attackerSlot.item && attackerSlot.item === typeToGemMap[move.type] && !attackerSlot.gemUsed) {
    itemDmgMult *= 1.3;
    attackerSlot.gemUsed = true;
    attackerSlot.item = null;
    setBattleDialogue(`💎 <b>${attacker.name}</b>의 <b>주얼</b>이 빛을 발하며 위력이 상승했다!`);
  }

  // 🍒 반감 열매 (Type-Resist Berries: 약점 피격 또는 노말 피격 시 데미지 0.5배 1회)
  const resistBerryMap = {
    '불꽃': 'occa_berry', '물': 'passho_berry', '전기': 'wacan_berry', '풀': 'rindo_berry',
    '얼음': 'yache_berry', '격투': 'chople_berry', '독': 'kebia_berry', '땅': 'shuca_berry',
    '비행': 'coba_berry', '에스퍼': 'payapa_berry', '벌레': 'tanga_berry', '바위': 'charti_berry',
    '고스트': 'kasib_berry', '드래곤': 'haban_berry', '악': 'colbur_berry', '강철': 'babiri_berry',
    '페어리': 'roseli_berry'
  };
  if (!isStruggle && !defenderSlot.itemUsed) {
    if ((typeMult >= 2.0 && defenderSlot.item === resistBerryMap[move.type]) || (move.type === '노말' && typeMult > 0 && defenderSlot.item === 'chilan_berry')) {
      const bObj = getItemObj(defenderSlot.item);
      itemDmgMult *= 0.5;
      defenderSlot.itemUsed = true;
      setBattleDialogue(`🍒 <b>${defender.name}</b>의 <b>${bObj.name}</b>이(가) 발동하여 기술의 위력을 약화시켰다!`);
    }
  }

  const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;
  let baseDmg = Math.floor((((2 * 50 / 5 + 2) * move.power * (atkStat / Math.max(1, defStat))) / 50) + 2);
  let finalDamage = Math.max(1, Math.floor(baseDmg * stab * typeMult * critMult * itemDmgMult * burnMult * randomFactor));
  if (typeMult === 0) finalDamage = 0;

  // Play 2D Dot Battle Move Animation
  if (typeof playPokeMoveAnimation === 'function') {
    await playPokeMoveAnimation(actor, move.name, { hit: (typeMult > 0), isCrit, typeMult });
  }

  // 풍선 피격 시 파괴
  if (finalDamage > 0 && defenderSlot.item === 'air_balloon') {
    defenderSlot.item = null;
    setBattleDialogue(`🎈 <b>${defender.name}</b>의 <b>풍선</b>이 터져버렸다!`);
  }

  // Apply damage
  const prevHP = defenderSlot.currentHP;
  let remainingHP = Math.max(0, prevHP - finalDamage);

  // Item: Focus Sash (기합의띠)
  if (prevHP === defenderSlot.maxHP && remainingHP === 0 && defenderSlot.item === 'focus_sash' && !defenderSlot.itemUsed) {
    remainingHP = 1;
    defenderSlot.itemUsed = true;
    setBattleDialogue(`🥋 <b>[${defender.name}]</b>은(는) <b>기합의띠</b>로 버텼다! (HP 1 남음)`);
  }

  // Item: Focus Band (기합의머리띠 10%)
  if (remainingHP === 0 && defenderSlot.item === 'focus_band' && Math.random() < 0.1) {
    remainingHP = 1;
    setBattleDialogue(`🎗️ <b>[${defender.name}]</b>은(는) <b>기합의머리띠</b>로 버텼다! (HP 1 남음)`);
  }

  const dealtDamage = prevHP - remainingHP;
  defenderSlot.currentHP = remainingHP;
  if (isStreamer) {
    pokeBattleState.stats.streamerDamage += dealtDamage;
  } else {
    pokeBattleState.stats.viewersDamage += dealtDamage;
    // 🎽 HAPTIC TRIGGER: 스트리머 피격 시 슈트에 데미지 비례 충격 전송!
    if (dealtDamage > 0) {
      const damagePercent = (dealtDamage / defenderSlot.maxHP) * 100.0;
      const currentHpPct = (remainingHP / defenderSlot.maxHP) * 100.0;
      triggerHapticDamage(damagePercent, currentHpPct, isCrit);
    }
  }

  // Defender hit visual animation
  if (defenderSpr && finalDamage > 0) {
    defenderSpr.classList.add('poke-sprite-defender');
    setTimeout(() => defenderSpr.classList.remove('poke-sprite-defender'), 500);
  }

  updateArenaHPBars();

  // Dialogue feedback
  let feedback = `💥 <b>${finalDamage}</b>의 데미지를 입혔다!`;
  if (isCrit && finalDamage > 0) feedback += ` <b style="color: #f59e0b;">(급소에 맞았다!)</b>`;
  if (typeMult >= 2.0) feedback += ` <b style="color: #ef4444;">(효과가 굉장했다!)</b>`;
  else if (typeMult > 0 && typeMult < 1.0) feedback += ` <b style="color: #64748b;">(효과가 별로인 듯하다...)</b>`;
  else if (typeMult === 0) feedback += ` <b style="color: #64748b;">(효과가 전혀 없다...)</b>`;

  setBattleDialogue(feedback);
  await battleSleep(320);

  // 대폭발 (Self-Destruct / Explosion): 사용 즉시 사용자 기절 (자폭 측이 먼저 기절 처리)
  const isSelfDestruct = move.name === '대폭발';
  if (isSelfDestruct && attackerSlot.currentHP > 0) {
    attackerSlot.currentHP = 0;
    updateArenaHPBars();
    setBattleDialogue(`💥 <b>${attacker.name}</b>은(는) 대폭발의 여파로 모든 체력을 소진했다!`);
    await battleSleep(240);
  }

  // 흡수 기술 (기가드레인, 드레인펀치): 입힌 데미지의 50% 회복 (큰뿌리 착용 시 65%)
  if (dealtDamage > 0 && (move.name === '기가드레인' || move.name === '드레인펀치') && attackerSlot.currentHP > 0) {
    const drainMult = attackerSlot.item === 'big_root' ? 0.65 : 0.5;
    const drainHeal = Math.max(1, Math.floor(dealtDamage * drainMult));
    attackerSlot.currentHP = Math.min(attackerSlot.maxHP, attackerSlot.currentHP + drainHeal);
    updateArenaHPBars();
    setBattleDialogue(`🌿 <b>${defender.name}</b>에게서 체력을 흡수했다! (+${drainHeal})`);
    await battleSleep(240);
  }

  // 인파이트 (Close Combat): 명중 시 자신의 방어/특수방어 -1랭크 하락
  if (dealtDamage > 0 && move.name === '인파이트' && attackerSlot.currentHP > 0) {
    attackerSlot.rankDef = clampRank((attackerSlot.rankDef || 0) - 1);
    attackerSlot.rankSpD = clampRank((attackerSlot.rankSpD || 0) - 1);
    await checkAndTriggerWhiteHerb(attackerSlot, attacker);
  }

  // 일반 반동기 (플레어드라이브, 브레이브버드, 우드해머, 볼트태클, 이판사판태클): 입힌 데미지의 1/3 반동
  const thirdRecoilMoves = new Set(['플레어드라이브', '브레이브버드', '우드해머', '볼트태클', '이판사판태클']);
  if (dealtDamage > 0 && thirdRecoilMoves.has(move.name) && attackerSlot.currentHP > 0) {
    const moveRecoil = Math.max(1, Math.floor(dealtDamage / 3));
    attackerSlot.currentHP = Math.max(0, attackerSlot.currentHP - moveRecoil);
    updateArenaHPBars();
    setBattleDialogue(`💥 <b>${attacker.name}</b>은(는) 기술의 반동으로 데미지를 입었다! (-${moveRecoil})`);
    await battleSleep(240);
  }

  // Struggle Recoil Damage (25% max HP)
  if (isStruggle && attackerSlot.currentHP > 0) {
    const struggleRecoil = Math.max(1, Math.floor(attackerSlot.maxHP * 0.25));
    attackerSlot.currentHP = Math.max(0, attackerSlot.currentHP - struggleRecoil);
    if (isStreamer) {
      const damagePercent = (struggleRecoil / attackerSlot.maxHP) * 100.0;
      const currentHpPct = (attackerSlot.currentHP / attackerSlot.maxHP) * 100.0;
      triggerHapticDamage(damagePercent, currentHpPct, false);
    }
    updateArenaHPBars();
    setBattleDialogue(`💥 <b>${attacker.name}</b>은(는) 발버둥의 반동으로 상처를 입었다! (-${struggleRecoil})`);
    await battleSleep(240);
  }

  // Post-hit Item Effects (공식 룰: 데미지가 실제로 들어갔을 때만 발동!)
  // 1. 조개껍질방울 (Shell Bell: 입힌 데미지의 1/8 회복)
  if (dealtDamage > 0 && attackerSlot.item === 'shell_bell' && attackerSlot.currentHP > 0 && attackerSlot.currentHP < attackerSlot.maxHP) {
    const sbHeal = Math.max(1, Math.floor(dealtDamage / 8));
    attackerSlot.currentHP = Math.min(attackerSlot.maxHP, attackerSlot.currentHP + sbHeal);
    updateArenaHPBars();
    setBattleDialogue(`🔔 <b>${attacker.name}</b>은(는) 조개껍질방울로 체력을 조금 회복했다! (+${sbHeal})`);
    await battleSleep(220);
  }

  // 2. Life Orb recoil (HP 10%, 데미지를 입혔을 때만 발동)
  if (finalDamage > 0 && attackerSlot.item === 'life_orb' && attackerSlot.currentHP > 0) {
    const recoil = Math.max(1, Math.floor(attackerSlot.maxHP * 0.1));
    attackerSlot.currentHP = Math.max(0, attackerSlot.currentHP - recoil);
    updateArenaHPBars();
    setBattleDialogue(`🔴 <b>${attacker.name}</b>은(는) 생명의구슬 반동으로 HP가 깎였다! (-${recoil})`);
    await battleSleep(240);
  }

  // 3. Rocky Helmet (울퉁불퉁멧: 물리 접촉 데미지를 입었을 때만 1/6 반사, 펀치글러브 착용 시 비접촉)
  const isPunchingGloveBlocked = attackerSlot.item === 'punching_glove' && move.name.includes('펀치');
  if (finalDamage > 0 && !isSpecial && !isPunchingGloveBlocked && defenderSlot.item === 'rocky_helmet' && attackerSlot.currentHP > 0) {
    const recoil = Math.max(1, Math.floor(attackerSlot.maxHP / 6));
    attackerSlot.currentHP = Math.max(0, attackerSlot.currentHP - recoil);
    updateArenaHPBars();
    setBattleDialogue(`🪖 <b>${attacker.name}</b>은(는) 상대의 울퉁불퉁멧에 상처를 입었다! (-${recoil})`);
    await battleSleep(240);
  }

  // 4. Weakness Policy (약점보험 +2 Atk/+2 SpA on super-effective hit)
  if (finalDamage > 0 && typeMult >= 2.0 && defenderSlot.item === 'weakness_policy' && !defenderSlot.itemUsed && defenderSlot.currentHP > 0) {
    defenderSlot.itemUsed = true;
    defenderSlot.rankAtk = clampRank((defenderSlot.rankAtk || 0) + 2);
    defenderSlot.rankSpA = clampRank((defenderSlot.rankSpA || 0) + 2);
    setBattleDialogue(`🛡️ <b>${defender.name}</b>은(는) 약점보험이 발동하여 공격/특수공격이 크게 상승했다!`);
    await battleSleep(300);
  }

  // 5. Sitrus / Oran Berry Heal (방어자 및 반동 입은 공격자 모두 체크)
  await checkAndTriggerBerryHeal(defenderSlot, defender);
  await checkAndTriggerBerryHeal(attackerSlot, attacker);

  // Faint Check & Official Double KO Tiebreaker
  let defDied = false;
  let atkDied = false;

  if (defenderSlot.currentHP <= 0) {
    defenderSlot.currentHP = 0;
    defenderSlot.fainted = true;
    defDied = true;
    if (defenderSpr) defenderSpr.classList.add('poke-sprite-fainted');
    renderArenaTeamBallsHUD();
    if (window.pokeSoundEngine) {
      window.pokeSoundEngine.playSe('faint.wav');
    }
    await battleSleep(350);
    setBattleDialogue(`💀 <b>${defender.name}</b>은(는) 쓰러졌다!`);

    // 길동무 (Destiny Bond) 발동: 피격자가 길동무 상태였다면 공격자도 함께 기절
    if (defenderSlot.destinyBond && attackerSlot.currentHP > 0) {
      attackerSlot.currentHP = 0;
      await battleSleep(250);
      setBattleDialogue(`👻 <b>${defender.name}</b>은(는) 상대 <b>${attacker.name}</b>을(를) 길동무로 데려갔다!`);
    }
  }

  if (attackerSlot.currentHP <= 0) {
    attackerSlot.currentHP = 0;
    attackerSlot.fainted = true;
    atkDied = true;
    if (attackerSpr) attackerSpr.classList.add('poke-sprite-fainted');
    renderArenaTeamBallsHUD();
    if (window.pokeSoundEngine) {
      window.pokeSoundEngine.playSe('faint.wav');
    }
    await battleSleep(350);
    setBattleDialogue(`💀 <b>${attacker.name}</b>은(는) 쓰러졌다!`);
  }

  if (defDied && atkDied) {
    // 공식 룰: 대폭발(자폭기)은 사용자가 먼저 기절하므로 방어 측 승리, 반동/생명의구슬/울퉁불퉁멧은 피격자가 먼저 기절하므로 공격 측 승리
    if (isSelfDestruct || defenderSlot.destinyBond) {
      lastDoubleKoWinner = isStreamer ? 'viewers' : 'streamer';
    } else {
      lastDoubleKoWinner = isStreamer ? 'streamer' : 'viewers';
    }
  }

  return defDied || atkDied;
}

async function handleRoundEndEffects() {
  const sides = [
    { side: 'streamer', slot: streamerTeam[streamerActiveIdx], spr: document.getElementById('arenaStreamerSprite') },
    { side: 'viewers', slot: viewersTeam[viewersActiveIdx], spr: document.getElementById('arenaViewersSprite') }
  ];

  for (const entry of sides) {
    const slot = entry.slot;
    if (!slot || slot.fainted || slot.currentHP <= 0) continue;
    const p = slot.pokemon;

    // 1. Leftovers & Black Sludge
    if (slot.item === 'leftovers' && slot.currentHP < slot.maxHP) {
      const heal = Math.max(1, Math.round(slot.maxHP / 16));
      slot.currentHP = Math.min(slot.maxHP, slot.currentHP + heal);
      updateArenaHPBars();
      setBattleDialogue(`🍎 <b>${p.name}</b>은(는) 먹다남은음식으로 체력을 조금 회복했다! (+${heal})`);
      await battleSleep(240);
    } else if (slot.item === 'black_sludge') {
      if (p.types.includes('독')) {
        if (slot.currentHP < slot.maxHP) {
          const heal = Math.max(1, Math.round(slot.maxHP / 16));
          slot.currentHP = Math.min(slot.maxHP, slot.currentHP + heal);
          updateArenaHPBars();
          setBattleDialogue(`🟣 <b>${p.name}</b>은(는) 검은진흙으로 체력을 조금 회복했다! (+${heal})`);
          await battleSleep(240);
        }
      } else {
        const dmg = Math.max(1, Math.round(slot.maxHP / 8));
        slot.currentHP = Math.max(0, slot.currentHP - dmg);
        updateArenaHPBars();
        setBattleDialogue(`🟣 <b>${p.name}</b>은(는) 검은진흙 때문에 데미지를 입었다! (-${dmg})`);
        await battleSleep(240);
      }
    }

    // 2. Burn (화상: 최대 HP의 1/16) & Bad Poison (맹독: N/16 누적)
    if (slot.currentHP > 0 && slot.status === 'brn') {
      const brnDmg = Math.max(1, Math.floor(slot.maxHP / 16));
      slot.currentHP = Math.max(0, slot.currentHP - brnDmg);
      updateArenaHPBars();
      setBattleDialogue(`🔥 <b>${p.name}</b>은(는) 화상으로 인한 데미지를 입었다! (-${brnDmg})`);
      await battleSleep(240);
    } else if (slot.currentHP > 0 && slot.status === 'tox') {
      const count = Math.min(15, slot.toxicCounter || 1);
      const toxDmg = Math.max(1, Math.floor((slot.maxHP * count) / 16));
      slot.toxicCounter = count + 1;
      slot.currentHP = Math.max(0, slot.currentHP - toxDmg);
      updateArenaHPBars();
      setBattleDialogue(`☠️ <b>${p.name}</b>은(는) 독으로 인한 데미지를 입었다! (-${toxDmg})`);
      await battleSleep(240);
    }

    await checkAndTriggerBerryHeal(slot, p);

    if (slot.currentHP <= 0) {
      slot.currentHP = 0;
      slot.fainted = true;
      if (entry.spr) entry.spr.classList.add('poke-sprite-fainted');
      renderArenaTeamBallsHUD();
      if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('faint.wav');
      await battleSleep(320);
      setBattleDialogue(`💀 <b>${p.name}</b>은(는) 쓰러졌다!`);
    }
  }

  if (await checkAndResolveTurnFaints()) {
    return;
  }

  pokeBattleState.round++;
  pokeBattleState.stats.totalRounds++;
  updateArenaHPBars();
  startSimultaneousPokeTurn();
}

// --- Faint Phase & Replacement Selection ---
async function checkAndResolveTurnFaints() {
  const sSlot = streamerTeam[streamerActiveIdx];
  const vSlot = viewersTeam[viewersActiveIdx];
  const sFainted = !sSlot || sSlot.fainted || sSlot.currentHP <= 0;
  const vFainted = !vSlot || vSlot.fainted || vSlot.currentHP <= 0;

  if (!sFainted && !vFainted) {
    return false;
  }

  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const sAlive = [];
  const vAlive = [];
  for (let i = 0; i < teamSize; i++) {
    if (streamerTeam[i] && !streamerTeam[i].fainted && streamerTeam[i].currentHP > 0) sAlive.push(i);
    if (viewersTeam[i] && !viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) vAlive.push(i);
  }

  // Check wipeout conditions
  if (sAlive.length === 0 && vAlive.length === 0) {
    // Double faint with no bench Pokemon remaining: use official recoil/self-KO winner rule
    finishPokeBattle(lastDoubleKoWinner || 'streamer');
    return true;
  }
  if (sAlive.length === 0) {
    finishPokeBattle('viewers');
    return true;
  }
  if (vAlive.length === 0) {
    finishPokeBattle('streamer');
    return true;
  }

  // Streamer fainted, viewers alive
  if (sFainted && !vFainted) {
    currentFaintTarget = 'streamer';
    openStreamerFaintSwitchModal(sAlive);
    return true;
  }

  // Viewers fainted, streamer alive
  if (vFainted && !sFainted) {
    currentFaintTarget = 'viewers';
    openViewersFaintSwitchVote(vAlive);
    return true;
  }

  // Both active fainted (3v3 mode with bench remaining on both sides)
  if (sFainted && vFainted) {
    currentFaintTarget = 'both';
    openStreamerFaintSwitchModal(sAlive);
    return true;
  }

  return false;
}

async function handleFaintPhase(faintedSide) {
  await checkAndResolveTurnFaints();
}

function openStreamerFaintSwitchModal(aliveSlots) {
  pokeBattleState.phase = 'faint_switch_streamer';
  streamerFaintAliveSlots = aliveSlots || [];
  const modal = document.getElementById('pokeFaintSwitchModal');
  const title = document.getElementById('pokeFaintSwitchTitle');
  const subTitle = document.getElementById('pokeFaintSwitchSubTitle');
  const list = document.getElementById('pokeFaintSwitchCandidatesList');

  if (title) title.innerText = `👑 ${getStreamerName()}: 다음 출전 포켓몬 선택`;
  if (subTitle) subTitle.innerText = '포켓몬이 쓰러졌습니다! 경기장에 투입할 다음 포켓몬을 선택하세요. (단축키: 1, 2 또는 제어창)';

  if (list) {
    list.innerHTML = aliveSlots.map((idx, fIdx) => {
      const slot = streamerTeam[idx];
      const p = slot.pokemon;
      const it = getItemObj(slot.item);
      const slotNum = idx + 1;
      const shortcutNum = fIdx + 1;
      return `
        <div class="poke-switch-card" onclick="handleStreamerFaintSelect(${idx})">
          <div style="display: flex; align-items: center; gap: 10px;">
            <kbd style="background: rgba(255,215,0,0.2); border: 1px solid rgba(255,215,0,0.4); border-radius: 4px; padding: 2px 6px; font-size: 12px; font-family: monospace; color: #ffd700; font-weight: 900;">${shortcutNum}</kbd>
            <img src="${p.sprite_front}" alt="${p.name}" style="width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated;">
            <div>
              <div style="font-weight: 800; font-size: 14px; color: #fff;">[${slotNum}번] ${p.name}</div>
              <div style="display: flex; gap: 4px; margin-top: 2px;">
                ${p.types.map(t => `<span class="type-badge type-${t}" style="font-size: 8px; padding: 1px 4px;">${t}</span>`).join('')}
                <span class="poke-item-badge" style="font-size: 9px;">${it.emoji} ${it.name}</span>
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 800; color: #4ade80;">HP ${slot.currentHP} / ${slot.maxHP}</div>
            <button type="button" class="btn btn-primary" style="padding: 4px 12px; font-size: 11px; margin-top: 4px;">⚡ ${slotNum}번 출전 <kbd style="font-size: 9px; opacity: 0.8; margin-left: 2px;">[${shortcutNum}]</kbd></button>
          </div>
        </div>
      `;
    }).join('');
  }

  if (modal) modal.classList.add('active');
  updateStreamerControllerPopout();

  // Timer for Streamer (synced with pokeStreamerDurationSelect)
  const sTimer = parseFloat(document.getElementById('pokeVoteDurationSelect')?.value || document.getElementById('drawerTurnLimitSelect')?.value || document.getElementById('pokeStreamerDurationSelect')?.value || 30.0) || 30.0;
  pokeBattleState.faintTimerTotal = sTimer;
  pokeBattleState.faintTimerRemaining = sTimer;
  renderFaintTimerUI();

  clearInterval(pokeBattleState.faintTimerInterval);
  pokeBattleState.faintTimerInterval = setInterval(() => {
    pokeBattleState.faintTimerRemaining -= 0.1;
    if (pokeBattleState.faintTimerRemaining <= 0) {
      pokeBattleState.faintTimerRemaining = 0;
      clearInterval(pokeBattleState.faintTimerInterval);
      handleStreamerFaintSelect(aliveSlots[0]);
    }
    renderFaintTimerUI();
  }, 100);
}

function renderFaintTimerUI() {
  const tText = document.getElementById('pokeFaintSwitchTimerText');
  const tFill = document.getElementById('pokeFaintSwitchTimerFill');
  if (tText) tText.innerText = `${Math.max(0, pokeBattleState.faintTimerRemaining).toFixed(1)}s`;
  if (tFill) {
    const pct = (Math.max(0, pokeBattleState.faintTimerRemaining) / pokeBattleState.faintTimerTotal) * 100;
    tFill.style.width = `${pct}%`;
  }
  updateStreamerControllerTimer();
}

async function handleStreamerFaintSelect(idx) {
  clearInterval(pokeBattleState.faintTimerInterval);
  const modal = document.getElementById('pokeFaintSwitchModal');
  if (modal) modal.classList.remove('active');

  streamerActiveIdx = idx;
  updateArenaActivePokemonUI();
  renderArenaTeamBallsHUD();
  updateArenaHPBars();
  updateStreamerControllerPopout();

  const spr = document.getElementById('arenaStreamerSprite');
  if (spr) spr.classList.remove('poke-sprite-fainted');

  setBattleDialogue(`👑 <b>[${escapeHtml(getStreamerName())}]</b>은(는) <b>[${escapeHtml(streamerTeam[idx].pokemon.name)}]</b>(을)를 출전시켰다!`);
  await battleSleep(350);

  if (await applyStealthRockOnEntry('streamer')) {
    await checkAndResolveTurnFaints();
    return;
  }

  // Double faint check in 3v3: if viewers active slot is also fainted, transition to viewers replacement
  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const vSlot = viewersTeam[viewersActiveIdx];
  if (vSlot && (vSlot.fainted || vSlot.currentHP <= 0)) {
    const vAlive = [];
    for (let i = 0; i < teamSize; i++) {
      if (viewersTeam[i] && !viewersTeam[i].fainted && viewersTeam[i].currentHP > 0) vAlive.push(i);
    }
    if (vAlive.length === 0) {
      finishPokeBattle('streamer');
      return;
    }
    openViewersFaintSwitchVote(vAlive);
    return;
  }

  pokeBattleState.round++;
  pokeBattleState.stats.totalRounds++;
  startSimultaneousPokeTurn();
}

let faintAliveSlotsCached = [];

function openViewersFaintSwitchVote(aliveSlots) {
  pokeBattleState.phase = 'faint_switch_viewers';
  faintVoteUsers.clear();
  faintVoteCounts = {};
  aliveSlots.forEach(slotIdx => { faintVoteCounts[slotIdx] = 0; });
  faintAliveSlotsCached = aliveSlots;

  const modal = document.getElementById('pokeFaintSwitchModal');
  const title = document.getElementById('pokeFaintSwitchTitle');
  const subTitle = document.getElementById('pokeFaintSwitchSubTitle');

  if (title) title.innerText = '👥 시청자 연합: 다음 출전 포켓몬 투표';
  const slotNumList = aliveSlots.map(s => `${s + 1}번`).join(', ');
  if (subTitle) subTitle.innerText = `포켓몬이 쓰러졌습니다! 채팅창에 출전시킬 번호 [${slotNumList}] 또는 포켓몬명을 입력하세요. (🔒 블라인드 투표)`;

  renderFaintVoteCandidatesUI(aliveSlots, false);
  if (modal) modal.classList.add('active');

  // Timer for Viewers (synced with pokeVoteDurationSelect)
  const vTimer = parseFloat(document.getElementById('pokeVoteDurationSelect')?.value || document.getElementById('drawerTurnLimitSelect')?.value || 30.0) || 30.0;
  pokeBattleState.faintTimerTotal = vTimer;
  pokeBattleState.faintTimerRemaining = vTimer;
  renderFaintTimerUI();

  clearInterval(pokeBattleState.faintTimerInterval);
  pokeBattleState.faintTimerInterval = setInterval(() => {
    pokeBattleState.faintTimerRemaining -= 0.1;
    if (pokeBattleState.faintTimerRemaining <= 0) {
      pokeBattleState.faintTimerRemaining = 0;
      clearInterval(pokeBattleState.faintTimerInterval);
      finishViewersFaintVote(aliveSlots);
    }
    renderFaintTimerUI();
  }, 100);
}

function recomputeFaintVotes() {
  for (const k of Object.keys(faintVoteCounts)) { faintVoteCounts[k] = 0; }
  for (const [uid, slotIdx] of faintVoteUsers.entries()) {
    if (faintVoteCounts[slotIdx] !== undefined) {
      faintVoteCounts[slotIdx] = (faintVoteCounts[slotIdx] || 0) + 1;
    }
  }
}

function renderFaintVoteCandidatesUI(aliveSlots, isReveal = false, winningSlot = null) {
  if (aliveSlots && aliveSlots.length > 0) {
    faintAliveSlotsCached = aliveSlots;
  } else if (faintAliveSlotsCached && faintAliveSlotsCached.length > 0) {
    aliveSlots = faintAliveSlotsCached;
  } else {
    aliveSlots = [];
    for (let i = 0; i < (pokeBattleMode === '3v3' ? 3 : 1); i++) {
      if (!viewersTeam[i].fainted) aliveSlots.push(i);
    }
    faintAliveSlotsCached = aliveSlots;
  }

  const list = document.getElementById('pokeFaintSwitchCandidatesList');
  if (!list) return;

  const total = faintVoteUsers.size;

  list.innerHTML = aliveSlots.map(slotIdx => {
    const slotNum = slotIdx + 1;
    const slot = viewersTeam[slotIdx];
    const p = slot.pokemon;
    const it = getItemObj(slot.item);
    const count = faintVoteCounts[slotIdx] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isWinning = (winningSlot === slotIdx);

    return `
      <div class="poke-switch-card" style="cursor: default; ${isWinning ? 'border-color: #ffd700; background: rgba(255, 215, 0, 0.12); box-shadow: 0 0 16px rgba(255, 215, 0, 0.35);' : ''}">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.sprite_front}" alt="${p.name}" style="width: 44px; height: 44px; object-fit: contain; image-rendering: pixelated;">
          <div>
            <div style="font-weight: 800; font-size: 13px; color: #fff;">
              [${slotNum}번 슬롯] ${p.name}
              ${isWinning ? '<span style="color: #ffd700; font-size: 11px; margin-left: 6px;">👑 1위 출전 확정!</span>' : ''}
            </div>
            <div style="display: flex; gap: 4px; margin-top: 2px;">
              ${p.types.map(t => `<span class="type-badge type-${t}" style="font-size: 8px; padding: 1px 4px;">${t}</span>`).join('')}
              <span class="poke-item-badge" style="font-size: 9px;">${it.emoji} ${it.name}</span>
            </div>
          </div>
        </div>
        <div style="width: 190px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-sub); margin-bottom: 3px;">
            <span>채팅에 <b>${slotNum}</b> 또는 <b>${p.name}</b></span>
            ${!isReveal ? `
              <span style="font-size: 10px; color: #94a3b8; font-weight: 700; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">🔒 집계 중...</span>
            ` : `
              <span style="color: ${isWinning ? '#ffd700' : '#38bdf8'}; font-weight: 900;">${count}표 (${pct}%) ${isWinning ? '👑' : ''}</span>
            `}
          </div>
          <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); position: relative;">
            ${!isReveal ? `
              <div style="height: 100%; width: 100%; background: linear-gradient(90deg, rgba(56, 189, 248, 0.1), rgba(0, 255, 163, 0.25), rgba(56, 189, 248, 0.1)); background-size: 200% 100%; animation: votePulse 2s infinite linear; border-radius: 3px;"></div>
            ` : `
              <div style="height: 100%; width: ${pct}%; background: ${isWinning ? 'linear-gradient(90deg, #ffd700, #00ffa3)' : 'linear-gradient(90deg, #38bdf8, #00ffa3)'}; border-radius: 3px; transition: width 0.4s ease-out;"></div>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function finishViewersFaintVote(aliveSlots) {
  clearInterval(pokeBattleState.faintTimerInterval);

  let maxVotes = 0;
  let topChoices = [];
  aliveSlots.forEach(slotIdx => {
    const v = faintVoteCounts[slotIdx] || 0;
    if (v > maxVotes) {
      maxVotes = v;
      topChoices = [slotIdx];
    } else if (v === maxVotes && maxVotes > 0) {
      topChoices.push(slotIdx);
    }
  });

  let chosenSlotIdx = aliveSlots[0];
  if (maxVotes > 0 && topChoices.length > 0) {
    chosenSlotIdx = topChoices[Math.floor(Math.random() * topChoices.length)];
  } else {
    chosenSlotIdx = aliveSlots[Math.floor(Math.random() * aliveSlots.length)];
  }

  // 1. Reveal final vote results and winning Pokemon for 400ms
  renderFaintVoteCandidatesUI(aliveSlots, true, chosenSlotIdx);
  await battleSleep(400);

  const modal = document.getElementById('pokeFaintSwitchModal');
  if (modal) modal.classList.remove('active');

  viewersActiveIdx = chosenSlotIdx;
  updateArenaActivePokemonUI();
  renderArenaTeamBallsHUD();
  updateArenaHPBars();

  const spr = document.getElementById('arenaViewersSprite');
  if (spr) spr.classList.remove('poke-sprite-fainted');

  setBattleDialogue(`👥 <b>시청자 연합</b>은 <b>[${escapeHtml(viewersTeam[chosenSlotIdx].pokemon.name)}]</b>(을)를 출전시켰다!`);
  await battleSleep(350);

  if (await applyStealthRockOnEntry('viewers')) {
    await checkAndResolveTurnFaints();
    return;
  }

  // Double faint check in 3v3: if streamer active slot is also fainted, transition to streamer replacement
  const teamSize = pokeBattleMode === '3v3' ? 3 : 1;
  const sSlot = streamerTeam[streamerActiveIdx];
  if (sSlot && (sSlot.fainted || sSlot.currentHP <= 0)) {
    const sAlive = [];
    for (let i = 0; i < teamSize; i++) {
      if (streamerTeam[i] && !streamerTeam[i].fainted && streamerTeam[i].currentHP > 0) sAlive.push(i);
    }
    if (sAlive.length === 0) {
      finishPokeBattle('viewers');
      return;
    }
    openStreamerFaintSwitchModal(sAlive);
    return;
  }

  pokeBattleState.round++;
  pokeBattleState.stats.totalRounds++;
  startSimultaneousPokeTurn();
}

// --- Victory & Result Screen ---
function launchConfetti() {
  try {
    let canvas = document.getElementById('confettiCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confettiCanvas';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pieces = [];
    const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#ffd700'];
    for (let i = 0; i < 70; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 50,
        r: 4 + Math.random() * 6,
        d: 1 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10,
        tiltAngleInc: (Math.random() * 0.07) + 0.05,
        tiltAngle: 0
      });
    }

    let frames = 0;
    function draw() {
      frames++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      if (frames < 140) {
        requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    draw();
  } catch (e) {}
}

function finishPokeBattle(winnerActor) {
  pokeBattleState.active = false;
  pokeBattleState.phase = 'ended';
  updateStreamerControllerPopout();

  // 🏆 Poke Sound Engine: Victory fanfare on battle end
  // 시청자든 스트리머든 승패 상관없이 게임이 끝나면 승리 배경음악 즉각 출력
  if (window.pokeSoundEngine) {
    window.pokeSoundEngine.playBgm('victory', 400);
  }

  const isStreamerWinner = winnerActor === 'streamer';
  const winnerTeam = isStreamerWinner ? streamerTeam : viewersTeam;
  const mvpSlot = (winnerTeam && winnerTeam.length > 0) ? (winnerTeam.find(s => !s.fainted) || winnerTeam[0]) : null;

  const modal = document.getElementById('pokeBattleResultModal');
  const title = document.getElementById('pokeResultTitle');
  const subTitle = document.getElementById('pokeResultSubTitle');
  const sprite = document.getElementById('pokeResultWinnerSprite');
  const statsBox = document.getElementById('pokeResultStatsBox');

  if (title) {
    title.innerText = isStreamerWinner ? `👑 ${getStreamerName()}의 대승리!` : '👥 시청자 연합의 집단지성 승리!';
    title.style.color = isStreamerWinner ? '#ffd700' : '#38bdf8';
  }
  if (subTitle) {
    subTitle.innerText = `${isStreamerWinner ? getStreamerName() : '시청자 연합'}이 상대의 모든 포켓몬을 쓰러뜨리고 매치 챔피언에 올랐습니다!`;
  }
  if (sprite && mvpSlot && mvpSlot.pokemon) {
    sprite.src = mvpSlot.pokemon.sprite_front;
  }
  if (statsBox) {
    statsBox.innerHTML = `
      <div>⚔️ 배틀 모드: <b>${pokeBattleMode === '3v3' ? '3v3 팀 엔트리 교체 배틀' : '1v1 에이스 배틀'}</b></div>
      <div>⚔️ 총 진행 라운드: <b>${pokeBattleState.round}라운드</b></div>
      <div>👑 ${escapeHtml(getStreamerName())} 총 데미지: <b style="color: #ffd700;">${pokeBattleState.stats.streamerDamage}</b></div>
      <div>👥 시청자 연합 총 데미지: <b style="color: #38bdf8;">${pokeBattleState.stats.viewersDamage}</b></div>
      <div>💥 급소(크리티컬) 발생: <b>${pokeBattleState.stats.crits}회</b> / 약점 강타: <b>${pokeBattleState.stats.superEffective}회</b></div>
    `;
  }

  if (modal) modal.classList.add('active');
  launchConfetti();
}

function rematchPokeBattle() {
  closePokeResultModal();
  startPokeBattle();
}

function quitPokeBattle() {
  pokeBattleState.active = false;
  if (window.pokeSoundEngine) {
    window.pokeSoundEngine.stop(400);
  }
  clearInterval(pokeBattleState.streamerTimerInterval);
  clearInterval(pokeBattleState.viewersTimerInterval);
  clearInterval(pokeBattleState.faintTimerInterval);
  const faintModal = document.getElementById('pokeFaintSwitchModal');
  if (faintModal) faintModal.classList.remove('active');

  // Revert all team slots to clean base form
  for (let i = 0; i < 3; i++) {
    if (streamerTeam[i]) revertPokemonToBaseForm(streamerTeam[i]);
    if (viewersTeam[i]) revertPokemonToBaseForm(viewersTeam[i]);
  }

  // Reset arena sprites & animations
  const sSpr = document.getElementById('arenaStreamerSprite');
  if (sSpr) {
    sSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    sSpr.style.opacity = '1';
    sSpr.style.transform = 'none';
    sSpr.style.filter = 'none';
  }
  const vSpr = document.getElementById('arenaViewersSprite');
  if (vSpr) {
    vSpr.classList.remove('poke-sprite-fainted', 'poke-sprite-attacker', 'poke-sprite-damaged');
    vSpr.style.opacity = '1';
    vSpr.style.transform = 'none';
    vSpr.style.filter = 'none';
  }

  document.getElementById('pokeBattleArenaStage').style.display = 'none';
  document.getElementById('pokeBattleSetupStage').style.display = 'block';
  renderPokeSetupPreview();
}

function closePokeResultModal() {
  const modal = document.getElementById('pokeBattleResultModal');
  if (modal) modal.classList.remove('active');
  quitPokeBattle();
}

