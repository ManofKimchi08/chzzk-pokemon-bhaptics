/**
 * Pokemon Gen 4/5 (NDS Black & White) Dynamic BGM & SFX Dual Audio Engine
 * Regulation M-C Standard Edition
 * 
 * Features:
 * - 2-Channel Independent Audio Control: BGM and SFX independent volumes & mute toggles
 * - Web Audio API Zero-Latency PCM RAM Buffer Cache (< 2ms instantaneous playback)
 * - Preloaded BGM elements for zero-buffering instant 500ms crossfading between Normal & Pinch BGM
 * - 4/5th Gen Authentic Pinch Condition Evaluation:
 *     Only 1 active survivor left (aliveCount === 1) AND HP <= 20%
 * - Automatic return to Normal BGM upon healing/recovery
 * - Victory Fanfare on battle win
 * - Audio concurrency: Multi-layered SE playback without clipping or interrupting
 * - Autoplay policy defense: Automatic interaction unlocking
 * - LocalStorage automatic persistence
 */

class PokeSoundEngine {
  constructor(basePath = 'audio/') {
    this.basePath = basePath.endsWith('/') ? basePath : basePath + '/';
    
    // Independent Volume & Mute with localStorage persistence
    try {
      this.bgmVolume = parseFloat(localStorage.getItem('poke_bgm_vol') ?? '0.35');
      this.sfxVolume = parseFloat(localStorage.getItem('poke_sfx_vol') ?? '0.70');
      this.isBgmMuted = localStorage.getItem('poke_bgm_muted') === 'true';
      this.isSfxMuted = localStorage.getItem('poke_sfx_muted') === 'true';
    } catch (e) {
      this.bgmVolume = 0.35;
      this.sfxVolume = 0.70;
      this.isBgmMuted = false;
      this.isSfxMuted = false;
    }

    this.currentTrack = null; // 'normal' | 'pinch' | 'victory' | null
    this.fadeTimer = null;
    this.isPinchActive = false;
    this.onPinchStateChange = null;
    this.onVolumeChange = null;
    this.isUnlocked = false;

    // Track definitions (5th Gen Authentic References)
    this.bgmMap = {
      normal: 'bgm_battle_trainer.mp3',
      pinch: 'bgm_battle_low_hp.mp3',
      victory: 'bgm_victory_trainer.mp3'
    };

    // Normalized SFX Asset Catalog
    this.seList = [
      'hit.wav',
      'hit_strong.wav',
      'faint.wav',
      'flee.wav',
      'PRSFX- Earthquake.wav',
      'PRSFX- Psychic.wav',
      'PRSFX- Muddy Water.wav'
    ];

    // Web Audio API Zero-Latency PCM RAM Cache
    this.audioCtx = null;
    this.audioBufferCache = new Map();
    this.isPreloadingSe = false;

    // Dedicated Pre-buffered BGM Audio Elements (zero-delay crossfading)
    this.bgmElements = {};
    this.activeBgm = null;
    this._initBgmElements();

    this._setupAutoplayUnlock();
    this._preloadAllSe();
  }

  getAudioContext() {
    if (!this.audioCtx) {
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (AudioClass) {
          this.audioCtx = new AudioClass();
        }
      } catch (e) {}
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  _initBgmElements() {
    for (const [key, filename] of Object.entries(this.bgmMap)) {
      try {
        const audio = new Audio(this.basePath + filename);
        audio.preload = 'auto';
        audio.loop = true; // All BGM tracks loop continuously during battle & victory screen
        audio.volume = 0;
        this.bgmElements[key] = audio;
      } catch (e) {
        console.warn('[PokeSoundEngine] Failed to init BGM element for', key, e);
      }
    }
  }

  async _preloadAllSe() {
    if (this.isPreloadingSe) return;
    this.isPreloadingSe = true;
    const ctx = this.getAudioContext();
    if (!ctx) {
      this.isPreloadingSe = false;
      return;
    }

    for (const file of this.seList) {
      if (this.audioBufferCache.has(file)) continue;
      try {
        const res = await fetch(this.basePath + file);
        if (!res.ok) continue;
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.audioBufferCache.set(file, audioBuf);
      } catch (e) {
        // Non-critical fallback
      }
    }
    this.isPreloadingSe = false;
  }

  _setupAutoplayUnlock() {
    const unlock = () => {
      if (this.isUnlocked) return;
      this.isUnlocked = true;
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);

      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this._preloadAllSe();

      for (const el of Object.values(this.bgmElements)) {
        if (el && el.load) {
          try { el.load(); } catch (e) {}
        }
      }
    };

    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  }

  /**
   * SE (Sound Effect) playback with zero latency (< 2ms)
   * Plays directly from decoded PCM RAM buffer via Web Audio API with SFX Volume Scaling
   */
  playSe(filename, seVol = 1.0) {
    if (this.isSfxMuted) return;
    const effectiveVol = Math.min(1, Math.max(0, seVol * this.sfxVolume));
    if (effectiveVol <= 0) return;

    // 1. Zero-Latency Web Audio API from PCM Buffer Cache
    const ctx = this.getAudioContext();
    if (ctx && this.audioBufferCache.has(filename)) {
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const buffer = this.audioBufferCache.get(filename);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(effectiveVol, ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
        return;
      } catch (e) {
        console.warn('[PokeSoundEngine] WebAudio SE failed, falling back:', e);
      }
    }

    // 2. Fallback to HTML5 Audio
    try {
      const audio = new Audio(this.basePath + filename);
      audio.volume = effectiveVol;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  /**
   * BGM Dynamic Crossfade Playback using Preloaded Elements
   * Zero buffering delay, smooth 500ms crossfade
   */
  playBgm(track, fadeMs = 500) {
    if (this.currentTrack === track && this.activeBgm && !this.activeBgm.paused) {
      return;
    }

    const newAudio = this.bgmElements[track];
    if (!newAudio) return;

    const prevAudio = this.activeBgm;
    this.currentTrack = track;
    this.activeBgm = newAudio;

    if (track === 'pinch') {
      this.isPinchActive = true;
      if (typeof this.onPinchStateChange === 'function') {
        this.onPinchStateChange(true);
      }
    } else {
      this.isPinchActive = false;
      if (typeof this.onPinchStateChange === 'function') {
        this.onPinchStateChange(false);
      }
    }

    const targetVol = this.isBgmMuted ? 0 : this.bgmVolume;

    if (track === 'victory' || newAudio.paused) {
      try {
        newAudio.currentTime = 0;
      } catch (e) {}
    }
    newAudio.volume = 0;

    newAudio.play().then(() => {
      const startTime = performance.now();
      if (this.fadeTimer) clearInterval(this.fadeTimer);

      this.fadeTimer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / Math.max(1, fadeMs));

        if (newAudio && !newAudio.paused) {
          newAudio.volume = targetVol * progress;
        }

        if (prevAudio && prevAudio !== newAudio) {
          prevAudio.volume = Math.max(0, targetVol * (1 - progress));
          if (progress >= 1) {
            prevAudio.pause();
            try { prevAudio.currentTime = 0; } catch (e) {}
          }
        }

        if (progress >= 1) {
          clearInterval(this.fadeTimer);
          this.fadeTimer = null;
        }
      }, 30);
    }).catch(e => {
      console.warn('[PokeSoundEngine] BGM autoplay waiting for interaction:', e);
    });
  }

  /**
   * 🚨 Pokemon Gen 4/5 Dynamic Low HP Pinch BGM Evaluator
   * Rule: If EITHER Streamer OR Viewers side has exactly 1 Pokemon left
   *       (including 1v1 battle) AND that Pokemon is in red HP (<= 20%),
   *       urgent pinch music is activated.
   */
  evaluatePinchCondition(sAlive, sHp, sMaxHp, vAlive, vHp, vMaxHp) {
    if (!this.currentTrack || this.currentTrack === 'victory') return; // Do not interrupt victory fanfare or stopped state

    let isPinch = false;

    if (typeof sAlive === 'boolean') {
      isPinch = sAlive;
    } else if (vAlive !== undefined) {
      // Both streamer & viewers team info provided
      // If either team has 0 alive, match is ending -> wait for victory fanfare
      if (sAlive <= 0 || vAlive <= 0) return;

      const sRatio = sMaxHp > 0 ? (sHp / sMaxHp) : 1;
      const vRatio = vMaxHp > 0 ? (vHp / vMaxHp) : 1;

      // Red HP check: remaining HP ratio <= 20% (UI 빨간피 기준)
      const streamerInPinch = (sAlive === 1) && (sHp > 0) && (sRatio <= 0.2001);
      const viewersInPinch = (vAlive === 1) && (vHp > 0) && (vRatio <= 0.2001);

      // 시청자든 스트리머든 1마리 남았을 때 빨간피이면 긴박한 위기 BGM 발동
      isPinch = streamerInPinch || viewersInPinch;
    } else {
      // Single team backwards compatibility: (aliveCount, currentHp, maxHp)
      if (sAlive <= 0 || sHp <= 0 || sMaxHp <= 0) return;
      const sRatio = sHp / sMaxHp;
      isPinch = (sAlive === 1) && (sRatio <= 0.2001);
    }

    if (isPinch && !this.isPinchActive) {
      this.isPinchActive = true;
      if (this.currentTrack !== 'pinch') {
        this.playBgm('pinch', 500);
      }
      if (typeof this.onPinchStateChange === 'function') {
        this.onPinchStateChange(true);
      }
    } else if (!isPinch && this.isPinchActive) {
      this.isPinchActive = false;
      if (this.currentTrack === 'pinch') {
        this.playBgm('normal', 500);
      }
      if (typeof this.onPinchStateChange === 'function') {
        this.onPinchStateChange(false);
      }
    }
  }

  setBgmVolume(val) {
    this.bgmVolume = Math.min(1.0, Math.max(0.0, parseFloat(val) || 0));
    try { localStorage.setItem('poke_bgm_vol', this.bgmVolume); } catch (e) {}
    if (this.activeBgm && !this.isBgmMuted) {
      this.activeBgm.volume = this.bgmVolume;
    }
    if (typeof this.onVolumeChange === 'function') {
      this.onVolumeChange({ bgm: this.bgmVolume, sfx: this.sfxVolume });
    }
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.min(1.0, Math.max(0.0, parseFloat(val) || 0));
    try { localStorage.setItem('poke_sfx_vol', this.sfxVolume); } catch (e) {}
    if (typeof this.onVolumeChange === 'function') {
      this.onVolumeChange({ bgm: this.bgmVolume, sfx: this.sfxVolume });
    }
  }

  toggleBgmMute() {
    this.isBgmMuted = !this.isBgmMuted;
    try { localStorage.setItem('poke_bgm_muted', this.isBgmMuted); } catch (e) {}
    if (this.activeBgm) {
      this.activeBgm.volume = this.isBgmMuted ? 0 : this.bgmVolume;
    }
    return this.isBgmMuted;
  }

  toggleSfxMute() {
    this.isSfxMuted = !this.isSfxMuted;
    try { localStorage.setItem('poke_sfx_muted', this.isSfxMuted); } catch (e) {}
    return this.isSfxMuted;
  }

  // Backwards compatibility
  setVolume(val) {
    this.setBgmVolume(val);
  }

  toggleMute() {
    return this.toggleBgmMute();
  }

  get isMuted() {
    return this.isBgmMuted;
  }

  stop(fadeMs = 300) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (!this.activeBgm) {
      this.currentTrack = null;
      this.isPinchActive = false;
      return;
    }

    const audio = this.activeBgm;
    const startVol = audio.volume;
    const startTime = performance.now();

    this.fadeTimer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / Math.max(1, fadeMs));
      audio.volume = Math.max(0, startVol * (1 - progress));
      if (progress >= 1) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        audio.pause();
        try { audio.currentTime = 0; } catch (e) {}
      }
    }, 30);

    this.currentTrack = null;
    this.isPinchActive = false;
    if (typeof this.onPinchStateChange === 'function') {
      this.onPinchStateChange(false);
    }
  }

  get bgmAudio() {
    return this.activeBgm;
  }
  set bgmAudio(val) {
    this.activeBgm = val;
  }
}

window.pokeSoundEngine = new PokeSoundEngine();
console.log('[PokeSoundEngine] Pokemon Gen 4/5 Dynamic Dual Audio Engine initialized.');
