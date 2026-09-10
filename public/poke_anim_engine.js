/**
 * Pokemon Essentials & Elite Battle: DX (EBDX) Master Battle Animation Engine
 * 
 * Combines:
 * 1. Dedicated Cinematic EBDX Routines:
 *    - Surf: Authentic eb624_PU/eb624_EU giant tidal wave, eb540_4 splash burst, submerged target, Water1.ogg
 *    - Psychic: eb452 scrolling psychedelic cosmic background, target levitation & distortion, psychic crash
 *    - Earthquake: Scene-wide magnitude 24 arena rumble, ground fissure cracks, erupting boulders, Earth4.ogg
 * 2. Authentic Gen 4/5 NDS Multi-Frame Particle Sequences for all 74 project moves:
 *    - 96x96 spritesheet cell slicing (5 columns grid)
 *    - Exact NDS frame-by-frame particle positioning (Target 0, 1, 2, Focus 1, 2, 3, 4)
 *    - Smooth 45ms frame tempo with scale, angle, mirror, opacity, and lighter blend modes
 * 3. EBDX Atmosphere & Authentic Audio Layer:
 *    - Dynamic full-screen color dimming per element (Dark, Fire, Water, Ice, Electric, Psychic, Dragon, etc.)
 *    - Full-screen impact flashes (white/color)
 *    - Arena earthquake rumble on .poke-arena-container
 *    - Authentic Pokemon Sound Effects (OGG/WAV) streamed via Web Audio API + Retro Synth fallback
 *    - Bi-directional horizontal flip (Streamer L->R, Viewers R->L)
 *    - Miss evasion animation + floating badge + miss swoosh sound
 */

(function () {
  'use strict';

  var POKEROGUE_CDN_BASE = 'https://cdn.jsdelivr.net/gh/pagefaultgames/pokerogue-assets@beta/';
  var POKEROGUE_JSON_BASE = POKEROGUE_CDN_BASE + 'battle-anims/';
  var POKEROGUE_PNG_BASE = POKEROGUE_CDN_BASE + 'images/battle_anims/';

  var EBDX_IMG_BASE = 'https://cdn.jsdelivr.net/gh/Manurocker95/Pok-mon-Essentials-20.1-with-Elite-Battle-DX@master/Graphics/EBDX/Animations/Moves/';
  
  // 74 Project Moves Mapping
  var POKE_MOVE_MAP = {
    '10만마력': 'high-horsepower',
    '10만볼트': 'thunderbolt',
    '고드름떨구기': 'icicle-crash',
    '기가드레인': 'giga-drain',
    '기습': 'sucker-punch',
    '길동무': 'destiny-bond',
    '깨물어부수기': 'crunch',
    '나비춤': 'quiver-dance',
    '날개쉬기': 'roost',
    '냉동빔': 'ice-beam',
    '누르기': 'body-slam',
    '눈보라': 'blizzard',
    '달의불빛': 'moonlight',
    '대지의힘': 'earth-power',
    '더스트슈트': 'gunk-shot',
    '도깨비불': 'will-o-wisp',
    '독찌르기': 'poison-jab',
    '드래곤크루': 'dragon-claw',
    '드레인펀치': 'drain-punch',
    '러스터캐논': 'flash-cannon',
    '록커트': 'rock-polish',
    '리프블레이드': 'leaf-blade',
    '매지컬샤인': 'dazzling-gleam',
    '맹독': 'toxic',
    '명상': 'calm-mind',
    '문포스': 'moonblast',
    '번개': 'thunder',
    '벌레의야단법석': 'bug-buzz',
    '벌크업': 'bulk-up',
    '볼트태클': 'volt-tackle',
    '불대문자': 'fire-blast',
    '불릿펀치': 'bullet-punch',
    '브레이브버드': 'brave-bird',
    '사념의박치기': 'zen-headbutt',
    '사이코쇼크': 'psyshock',
    '사이코키네시스': 'psybeam',
    '섀도볼': 'shadow-ball',
    '섀도크루': 'shadow-claw',
    '솔라빔': 'solar-beam',
    '스텔스록': 'stealth-rock',
    '스톤샤워': 'rock-slide',
    '스톤에지': 'stone-edge',
    '시저크로스': 'x-scissor',
    '아이언헤드': 'iron-head',
    '아쿠아브레이크': 'liquidation',
    '악의파동': 'dark-pulse',
    '야습': 'shadow-sneak',
    '얼음뭉치': 'ice-shard',
    '에너지볼': 'energy-ball',
    '에어슬래시': 'air-slash',
    '역린': 'outrage',
    '오물폭탄': 'sludge-bomb',
    '용의춤': 'dragon-dance',
    '용의파동': 'dragon-pulse',
    '유턴': 'u-turn',
    '이판사판태클': 'double-edge',
    '인파이트': 'close-combat',
    '전기자석파': 'thunder-wave',
    '지진': 'earthquake',
    '철벽': 'iron-defense',
    '치근거리기': 'play-rough',
    '칼춤': 'swords-dance',
    '코멧펀치': 'meteor-mash',
    '탁쳐서떨구기': 'knock-off',
    '파도타기': 'surf',
    '파동탄': 'aura-sphere',
    '파워젬': 'power-gem',
    '폭포오르기': 'waterfall',
    '플레어드라이브': 'flare-blitz',
    '하이드로펌프': 'hydro-pump',
    '하이퍼보이스': 'hyper-voice',
    '화염방사': 'flamethrower',
    '발버둥': 'flail',
    '몸통박치기': 'tackle',
    '할퀴기': 'scratch',
    '불꽃세례': 'ember',
    '물대포': 'water-gun',
    '전기쇼크': 'thunder-shock'
  };

  // Move Atmosphere (Screen Dim Color & Sound & Shake Intensity)
  function getMoveAtmosphere(moveName) {
    var m = moveName || '';
    if (m.includes('볼트') || m.includes('번개') || m.includes('전기')) {
      return { dim: '#000000', dimAlpha: 0.65, sound: 'EBDX/Anim/electric1.ogg', shake: 13, flash: true };
    }
    if (m.includes('화염') || m.includes('불대문자') || m.includes('플레어') || m.includes('불꽃')) {
      return { dim: 'rgba(150, 30, 10, 1)', dimAlpha: 0.4, sound: 'Anim/Fire2.ogg', shake: 10, flash: false };
    }
    if (m.includes('물') || m.includes('하이드로') || m.includes('폭포') || m.includes('아쿠아') || m.includes('파도')) {
      return { dim: 'rgba(10, 50, 140, 1)', dimAlpha: 0.42, sound: 'Anim/Water1.ogg', shake: 12, flash: false };
    }
    if (m.includes('얼음') || m.includes('눈') || m.includes('냉동') || m.includes('고드름')) {
      return { dim: 'rgba(70, 180, 240, 1)', dimAlpha: 0.35, sound: 'Anim/Ice1.ogg', shake: 9, flash: false };
    }
    if (m.includes('사이코') || m.includes('사념') || m.includes('명상')) {
      return { dim: 'rgba(110, 20, 150, 1)', dimAlpha: 0.45, sound: 'Anim/Thunder3.ogg', shake: 11, flash: false };
    }
    if (m.includes('섀도') || m.includes('악') || m.includes('야습') || m.includes('기습') || m.includes('길동무')) {
      return { dim: '#000000', dimAlpha: 0.55, sound: 'Anim/Flash.ogg', shake: 10, flash: false };
    }
    if (m.includes('지진') || m.includes('대지의힘') || m.includes('스톤') || m.includes('록') || m.includes('10만마력')) {
      return { dim: '#000000', dimAlpha: 0.55, sound: 'Anim/Earth4.ogg', shake: 22, flash: false };
    }
    if (m.includes('인파이트') || m.includes('드레인펀치') || m.includes('불릿펀치') || m.includes('코멧펀치') || m.includes('태클')) {
      return { dim: '#ffffff', dimAlpha: 0.25, sound: 'Anim/hit.ogg', shake: 14, flash: true };
    }
    if (m.includes('드래곤') || m.includes('역린')) {
      return { dim: 'rgba(13, 148, 136, 1)', dimAlpha: 0.38, sound: 'Anim/Slash10.ogg', shake: 12, flash: false };
    }
    if (m.includes('문포스') || m.includes('치근') || m.includes('샤인') || m.includes('달')) {
      return { dim: 'rgba(236, 72, 153, 1)', dimAlpha: 0.35, sound: 'Anim/Refresh.ogg', shake: 9, flash: false };
    }
    if (m.includes('솔라') || m.includes('에너지') || m.includes('리프') || m.includes('기가')) {
      return { dim: 'rgba(34, 197, 94, 1)', dimAlpha: 0.35, sound: 'Anim/Saint8.ogg', shake: 11, flash: false };
    }
    return { dim: '#000000', dimAlpha: 0.3, sound: 'Anim/hit.ogg', shake: 8, flash: false };
  }

  // RAM Caches
  var animJsonCache = new Map();
  var imgCache = new Map();
  var audioBufferCache = new Map();

  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioCtx = new AudioClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function() {});
    }
    return audioCtx;
  }

  function playEbdxSound(relPath, volume) {
    volume = volume !== undefined ? volume : 0.85;
    var p = (relPath || '').toLowerCase();
    if (window.pokeSoundEngine) {
      if (p.includes('water') || p.includes('muddy') || p.includes('surf')) {
        window.pokeSoundEngine.playSe('PRSFX- Muddy Water.wav', volume);
        return;
      }
      if (p.includes('earth') || p.includes('rock') || p.includes('ground')) {
        window.pokeSoundEngine.playSe('PRSFX- Earthquake.wav', volume);
        return;
      }
      if (p.includes('thunder') || p.includes('electric') || p.includes('flash') || p.includes('psychic')) {
        window.pokeSoundEngine.playSe('PRSFX- Psychic.wav', volume);
        return;
      }
      if (p.includes('hit') || p.includes('slash') || p.includes('fire') || p.includes('ice') || p.includes('saint') || p.includes('refresh')) {
        window.pokeSoundEngine.playSe('hit.wav', volume);
        return;
      }
    }
    playRetroSynthSound(p.includes('hit') ? 'hit' : 'cast');
  }

  function triggerHitImpact(targetSpr, hitResult, atmos, canvas, ctx) {
    if (!hitResult || !hitResult.hit) return;
    triggerArenaRumble((atmos && atmos.shake) ? atmos.shake : 14, 350);
    if (atmos && atmos.flash && ctx && canvas) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (targetSpr) {
      targetSpr.classList.remove('poke-hit-shake', 'poke-hit-critical');
      void targetSpr.offsetWidth;
      if (hitResult.isCrit || (hitResult.typeMult && hitResult.typeMult >= 2.0)) {
        targetSpr.classList.add('poke-hit-critical');
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('hit_strong.wav');
        else playRetroSynthSound('hit', true);
      } else {
        targetSpr.classList.add('poke-hit-shake');
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('hit.wav');
        else playRetroSynthSound('hit', false);
      }
      setTimeout(function() {
        if (targetSpr) targetSpr.classList.remove('poke-hit-shake', 'poke-hit-critical');
      }, 500);
    }
  }

  function playRetroSynthSound(type, isCrit) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'hit') {
        osc.type = isCrit ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(isCrit ? 360 : 220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + (isCrit ? 0.35 : 0.22));
        gain.gain.setValueAtTime(isCrit ? 0.45 : 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + (isCrit ? 0.35 : 0.22));
        osc.start(now);
        osc.stop(now + (isCrit ? 0.35 : 0.22));
      } else if (type === 'miss') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch(e) {}
  }

  function loadImage(url) {
    if (imgCache.has(url)) return Promise.resolve(imgCache.get(url));
    return new Promise(function(resolve) {
      var timer = setTimeout(function() { resolve(null); }, 500);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      img.onload = function() {
        clearTimeout(timer);
        imgCache.set(url, img);
        resolve(img);
      };
      img.onerror = function() {
        clearTimeout(timer);
        resolve(null);
      };
    });
  }

  function loadMoveJson(slug) {
    if (animJsonCache.has(slug)) return Promise.resolve(animJsonCache.get(slug));
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, 500) : null;
    return fetch(POKEROGUE_JSON_BASE + slug + '.json', controller ? { signal: controller.signal } : {})
      .then(function(res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) return null;
        return res.json();
      })
      .then(function(data) {
        if (data) animJsonCache.set(slug, data);
        return data;
      })
      .catch(function() {
        if (timer) clearTimeout(timer);
        return null;
      });
  }

  function getOrCreateAnimCanvas() {
    var canvas = document.getElementById('pokeBattleAnimCanvas');
    var container = document.querySelector('.poke-arena-container');
    if (!container) return null;

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'pokeBattleAnimCanvas';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '25';
      container.appendChild(canvas);
    }

    var rect = container.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    }
    return canvas;
  }

  function getSpriteCenter(element, canvasRect) {
    if (!element) {
      return { x: canvasRect.width / 2, y: canvasRect.height / 2 };
    }
    var r = element.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - canvasRect.left,
      y: r.top + r.height / 2 - canvasRect.top
    };
  }

  function triggerArenaRumble(intensity, duration) {
    var container = document.querySelector('.poke-arena-container');
    if (!container) return;
    intensity = intensity || 12;
    duration = duration ? Math.min(300, duration) : 250;
    var startTime = performance.now();

    function rumbleStep(now) {
      var elapsed = now - startTime;
      if (elapsed >= duration) {
        container.style.transform = '';
        return;
      }
      var progress = elapsed / duration;
      var decay = Math.pow(1 - progress, 1.5);
      var curInt = intensity * decay;
      var rx = (Math.sin(elapsed * 0.08) * 0.7 + (Math.random() - 0.5) * 0.6) * curInt;
      var ry = (Math.cos(elapsed * 0.09) * 0.7 + (Math.random() - 0.5) * 0.6) * curInt;
      container.style.transform = 'translate(' + rx.toFixed(1) + 'px, ' + ry.toFixed(1) + 'px)';
      requestAnimationFrame(rumbleStep);
    }
    requestAnimationFrame(rumbleStep);
  }

  function getAnimSpeed() {
    return (window.pokeBattleSpeed && window.pokeBattleSpeed > 0) ? window.pokeBattleSpeed : 1.5;
  }

  function sleep(ms) {
    var speed = getAnimSpeed();
    return new Promise(function(r) { setTimeout(r, Math.max(6, Math.round(ms / speed))); });
  }

  // =========================================================================
  // 1. CINEMATIC EBDX SPECIAL ROUTINES (SURF, PSYCHIC, EARTHQUAKE)
  // =========================================================================

  /**
   * SURF (파도타기) - Genuine EBDX Tsunami Wave
   */
  async function playEbdxSurf(canvas, ctx, userX, userY, targetX, targetY, isStreamer, hitResult, animHitFeedback) {
    var waveImg = await loadImage(EBDX_IMG_BASE + (isStreamer ? 'eb624_PU.png' : 'eb624_EU.png'));
    var splashImg = await loadImage(EBDX_IMG_BASE + 'eb540_4.png');
    var targetSpr = document.getElementById(isStreamer ? 'arenaViewersSprite' : 'arenaStreamerSprite');

    playEbdxSound('Anim/Water1.ogg', 0.95);

    var startX = isStreamer ? -300 : canvas.width + 300;
    var startY = isStreamer ? canvas.height + 150 : -150;
    var endX = isStreamer ? canvas.width + 350 : -350;
    var endY = isStreamer ? -200 : canvas.height + 200;

    var totalFrames = 38;
    var splashParticles = [];

    // Scale wave to fit canvas height proportionally
    var waveBaseScale = (canvas.height / 850) * 0.85;

    for (var f = 0; f < totalFrames; f++) {
            if (f === 10 && hitResult && hitResult.hit) {
        triggerHitImpact(targetSpr, hitResult, { shake: 22, flash: false }, canvas, ctx);
        if (animHitFeedback) animHitFeedback.soundTriggered = true;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var t = f / totalFrames;

      // Ambient deep ocean blue dim
      var dimAlpha = Math.sin(t * Math.PI) * 0.45;
      ctx.save();
      ctx.fillStyle = 'rgba(10, 45, 120, 1)';
      ctx.globalAlpha = dimAlpha;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Wave position & dynamic scaling
      var waveX = startX + (endX - startX) * t;
      var waveY = startY + (endY - startY) * t;
      var waveScale = waveBaseScale * (1.0 + t * 0.4);
      var waveAlpha = Math.min(0.65, Math.sin(t * Math.PI) * 0.85);

      if (waveImg) {
        ctx.save();
        ctx.globalAlpha = waveAlpha;
        ctx.translate(waveX, waveY);
        ctx.scale(waveScale, waveScale * 1.1);
        ctx.drawImage(waveImg, -waveImg.width / 2, -waveImg.height / 2);
        ctx.restore();
      }

      // Wave hits target midpoint
      if (f === 18) {
        triggerArenaRumble(15, 600);
        if (hitResult && hitResult.hit) {
          triggerHitImpact(targetSpr, hitResult, { shake: 15, flash: false }, canvas, ctx);
          if (animHitFeedback) animHitFeedback.soundTriggered = true;
        }
        // Spawn 35 splash particles
        for (var s = 0; s < 35; s++) {
          var ang = Math.random() * Math.PI * 2;
          var spd = 4 + Math.random() * 9;
          splashParticles.push({
            x: targetX,
            y: targetY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 3.5,
            scale: 0.8 + Math.random() * 0.8,
            alpha: 1.0
          });
        }
      }

      // Target submerged wobble
      if (f >= 18 && f <= 30 && targetSpr) {
        var submergeY = Math.sin((f - 18) / 12 * Math.PI) * 18;
        var wobbleX = (Math.random() - 0.5) * 8;
        targetSpr.style.transform = 'translate(' + wobbleX + 'px, ' + submergeY + 'px)';
      } else if (f > 30 && targetSpr) {
        targetSpr.style.transform = '';
      }

      // Update & draw splash particles
      for (var pIdx = splashParticles.length - 1; pIdx >= 0; pIdx--) {
        var p = splashParticles[pIdx];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.38; // gravity
        p.alpha -= 0.035;
        if (p.alpha <= 0) {
          splashParticles.splice(pIdx, 1);
          continue;
        }
        if (splashImg) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.scale(p.scale, p.scale);
          ctx.drawImage(splashImg, -splashImg.width / 2, -splashImg.height / 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = '#60a5fa';
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 * p.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      await sleep(18);
    }

    if (targetSpr) targetSpr.style.transform = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * PSYCHIC (사이코키네시스) - Genuine EBDX Cosmic Space Distortion
   */
  async function playEbdxPsychic(canvas, ctx, targetX, targetY, isStreamer, hitResult, animHitFeedback) {
    var waveBg = await loadImage(EBDX_IMG_BASE + 'eb452.png');
    var targetSpr = document.getElementById(isStreamer ? 'arenaViewersSprite' : 'arenaStreamerSprite');

    playEbdxSound('Anim/Thunder3.ogg', 0.65);

    var totalFrames = 36;
    for (var f = 0; f < totalFrames; f++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var alpha = Math.sin(f / totalFrames * Math.PI) * 0.75;
      ctx.save();
      ctx.fillStyle = 'rgba(90, 10, 140, 1)';
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (waveBg) {
        var scrollOffset = (f * 18) % waveBg.width;
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(waveBg, -scrollOffset, canvas.height / 2 - waveBg.height / 2);
        ctx.drawImage(waveBg, waveBg.width - scrollOffset, canvas.height / 2 - waveBg.height / 2);
        ctx.restore();
      }

      // Telekinetic shock rings converging on target
      for (var r = 0; r < 3; r++) {
        var rT = (f * 0.08 + r * 0.33) % 1.0;
        var radius = (1 - rT) * 110 + 20;
        ctx.save();
        ctx.strokeStyle = '#c084fc';
        ctx.shadowColor = '#e879f9';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(targetX, targetY - 15, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Target levitation & vibration
      if (targetSpr) {
        if (f < 28) {
          var levY = -Math.sin(f / 28 * Math.PI) * 32;
          var vibX = (Math.random() - 0.5) * 10;
          targetSpr.style.transform = 'translate(' + vibX + 'px, ' + levY + 'px) scale(1.15, 0.88)';
        } else if (f === 28) {
          targetSpr.style.transform = 'translate(0, 8px) scale(0.95, 1.1)';
          triggerArenaRumble(13, 250);
          if (hitResult && hitResult.hit) {
            triggerHitImpact(targetSpr, hitResult, { shake: 13, flash: false }, canvas, ctx);
            if (animHitFeedback) animHitFeedback.soundTriggered = true;
          }
        } else {
          targetSpr.style.transform = '';
        }
      }

      await sleep(18);
    }

    if (targetSpr) targetSpr.style.transform = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * EARTHQUAKE (지진) - Genuine EBDX Scene-Wide Fissure & Rumble
   */
  async function playEbdxEarthquake(canvas, ctx, userX, userY, targetX, targetY, isStreamer, hitResult, animHitFeedback) {
    playEbdxSound('Anim/Earth4.ogg', 1.0);
    triggerArenaRumble(25, 350);
    var targetSpr = document.getElementById(isStreamer ? 'arenaViewersSprite' : 'arenaStreamerSprite');

    var totalFrames = 30;
    for (var f = 0; f < totalFrames; f++) {
            if (f === 10 && hitResult && hitResult.hit) {
        triggerHitImpact(targetSpr, hitResult, { shake: 22, flash: false }, canvas, ctx);
        if (animHitFeedback) animHitFeedback.soundTriggered = true;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var t = f / totalFrames;

      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.55;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Jagged fissure crack along ground
      ctx.save();
      ctx.strokeStyle = '#d97706';
      ctx.shadowColor = '#78350f';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 4;
      ctx.beginPath();
      var crackStartX = Math.min(userX, targetX) - 40;
      var crackEndX = Math.max(userX, targetX) + 60;
      var groundY = Math.max(userY, targetY) + 35;
      ctx.moveTo(crackStartX, groundY);
      for (var x = crackStartX; x <= crackEndX; x += 22) {
        var jY = groundY + ((Math.random() - 0.5) * 18);
        ctx.lineTo(x, jY);
      }
      ctx.stroke();
      ctx.restore();

      // Rock debris particles shooting up
      for (var d = 0; d < 10; d++) {
        var dbX = targetX + (Math.sin(d * 2.3 + f) * 70);
        var dbY = groundY - (f * 7.5) + (d * 14);
        if (dbY < groundY + 10) {
          ctx.save();
          ctx.fillStyle = d % 2 === 0 ? '#92400e' : '#78350f';
          ctx.beginPath();
          ctx.arc(dbX, dbY, 5 + (d % 5), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      await sleep(18);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // =========================================================================
  // 2. GENUINE NDS GEN 4/5 MULTI-FRAME PARTICLE ENGINE (FOR ALL 74 MOVES)
  // =========================================================================

  async function playNdsParticleAnim(canvas, ctx, userX, userY, targetX, targetY, isStreamer, moveName, hitResult, animHitFeedback) {
    var slug = POKE_MOVE_MAP[moveName] || 'tackle';
    var rawData = await loadMoveJson(slug);

    var userSpr = document.getElementById(isStreamer ? 'arenaStreamerSprite' : 'arenaViewersSprite');
    var targetSpr = document.getElementById(isStreamer ? 'arenaViewersSprite' : 'arenaStreamerSprite');

    if (!rawData) {
      return;
    }

    var animConfig = rawData;
    if (Array.isArray(rawData)) {
      animConfig = isStreamer ? rawData[0] : (rawData[1] || rawData[0]);
    }

    var defaultGraphic = animConfig.graphic || 'PRAS- Strike';
    var frames = animConfig.frames || [];

    var dx = targetX - userX;
    var dy = targetY - userY;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var normalX = -dy / dist;
    var normalY = dx / dist;
    var dir = isStreamer ? 1 : -1;

    var coordScale = dist / 143.1;
    var particleScale = Math.min(1.8, Math.max(1.0, coordScale * 0.7));

    // Preload graphics
    var graphicsToLoad = new Set();
    if (defaultGraphic) graphicsToLoad.add(defaultGraphic);
    for (var fIdx = 0; fIdx < frames.length; fIdx++) {
      var fr = frames[fIdx];
      for (var itIdx = 0; itIdx < fr.length; itIdx++) {
        if (fr[itIdx].graphic) graphicsToLoad.add(fr[itIdx].graphic);
      }
    }
    await Promise.all(Array.from(graphicsToLoad).map(function(g) {
      return loadImage(POKEROGUE_PNG_BASE + encodeURIComponent(g) + '.png');
    }));

    // Atmosphere
    var atmos = getMoveAtmosphere(moveName);
    playEbdxSound(atmos.sound, 0.85);

    var hasHitTriggered = false;

    for (var f = 0; f < frames.length; f++) {
      var frameItems = frames[f];
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Atmospheric background dim
      var animT = f / Math.max(1, frames.length);
      var curDimAlpha = Math.sin(animT * Math.PI) * atmos.dimAlpha;
      if (curDimAlpha > 0.02) {
        ctx.save();
        ctx.fillStyle = atmos.dim;
        ctx.globalAlpha = curDimAlpha;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      for (var i = 0; i < frameItems.length; i++) {
        var item = frameItems[i];
        if (item.visible === false) continue;

        if (item.target === 0) {
          var offX = (item.x || 0) * 0.3 * dir;
          var offY = (item.y || 0) * 0.3;
          if (userSpr) userSpr.style.transform = 'translate(' + offX + 'px, ' + offY + 'px)';
        } else if (item.target === 1) {
          var offX1 = (item.x || 0) * 0.3 * dir;
          var offY1 = (item.y || 0) * 0.3;
          if (targetSpr) targetSpr.style.transform = 'translate(' + offX1 + 'px, ' + offY1 + 'px)';
          if (!hasHitTriggered && (Math.abs(item.x || 0) > 4 || Math.abs(item.y || 0) > 4)) {
            hasHitTriggered = true;
            triggerHitImpact(targetSpr, hitResult, atmos, canvas, ctx);
            if (animHitFeedback) animHitFeedback.soundTriggered = true;
          }
        } else if (item.target === 2) {
          var posX = 0;
          var posY = 0;
          var focus = item.focus !== undefined ? item.focus : 1;

          if (focus === 1) {
            posX = targetX + ((item.x || 0) - 128) * coordScale * dir;
            posY = targetY + ((item.y || 0) + 64) * coordScale;
          } else if (focus === 2) {
            posX = userX + (item.x || 0) * coordScale * dir;
            posY = userY + (item.y || 0) * coordScale;
          } else if (focus === 3) {
            var t = (item.x || 0) / 128;
            var refPerp = (item.y || 0) - (-64 * t);
            posX = userX + t * dx + normalX * refPerp * coordScale;
            posY = userY + t * dy + normalY * refPerp * coordScale;
          } else if (focus === 4) {
            posX = canvas.width / 2 + (item.x || 0) * coordScale * dir;
            posY = canvas.height / 2 + (item.y || 0) * coordScale;
          }

          var gName = item.graphic || defaultGraphic;
          var gImg = imgCache.get(POKEROGUE_PNG_BASE + encodeURIComponent(gName) + '.png');
          if (!gImg) continue;

          var cellIdx = item.graphicFrame || 0;
          var col = cellIdx % 5;
          var row = Math.floor(cellIdx / 5);
          var srcX = col * 96;
          var srcY = row * 96;
          var srcW = 96;
          var srcH = 96;

          var zoomX = ((item.zoomX !== undefined ? item.zoomX : 100) / 100) * particleScale;
          var zoomY = ((item.zoomY !== undefined ? item.zoomY : 100) / 100) * particleScale;
          if (item.mirror) zoomX = -zoomX;

          var angle = -(item.angle || 0) * (Math.PI / 180) * dir;
          var opacity = (item.opacity !== undefined ? item.opacity : 255) / 255;
          if (opacity <= 0) continue;

          ctx.save();
          ctx.translate(posX, posY);
          if (dir < 0) ctx.scale(-1, 1);
          if (angle) ctx.rotate(angle);
          ctx.scale(zoomX, zoomY);
          ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
          if (item.blendType === 1) ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(gImg, srcX, srcY, srcW, srcH, -48, -48, 96, 96);
          ctx.restore();
        }
      }

      // Midpoint hit trigger fallback if target=1 wasn't specified in animation JSON
      var midFrame = Math.max(5, Math.floor(frames.length * 0.35));
      if (!hasHitTriggered && f === midFrame && hitResult && hitResult.hit) {
        hasHitTriggered = true;
        triggerHitImpact(targetSpr, hitResult, atmos, canvas, ctx);
        if (animHitFeedback) animHitFeedback.soundTriggered = true;
      }

      await sleep(20);
    }

    if (userSpr) userSpr.style.transform = '';
    if (targetSpr) targetSpr.style.transform = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // =========================================================================
  // 3. HIT FEEDBACK & MISS HANDLING
  // =========================================================================

  async function finishHitFeedback(targetSpr, hitResult, canvas, ctx, targetX, targetY, animHitFeedback) {
    if (!hitResult) return;

    if (hitResult.hit) {
      // If hit sound wasn't triggered during particle anim, trigger it now as safety fallback
      if (!animHitFeedback || !animHitFeedback.soundTriggered) {
        triggerHitImpact(targetSpr, hitResult, { shake: 12, flash: false }, canvas, ctx);
        if (animHitFeedback) animHitFeedback.soundTriggered = true;
      }
    } else {
      // Miss feedback
      if (window.pokeSoundEngine) {
        window.pokeSoundEngine.playSe('flee.wav');
      } else {
        playRetroSynthSound('miss');
      }
      if (targetSpr) {
        targetSpr.classList.remove('poke-miss-dodge');
        void targetSpr.offsetWidth;
        targetSpr.classList.add('poke-miss-dodge');
        setTimeout(function() {
          targetSpr.classList.remove('poke-miss-dodge');
        }, 350);
      }

      // Floating '💨 빗나감!' Badge
      var badgeStart = targetY - 45;
      for (var b = 0; b < 8; b++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var badgeY = badgeStart - b * 2.5;
        var alpha = Math.max(0, 1 - (b / 8));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1.5;
        var text = '💨 빗나감!';
        ctx.font = 'bold 15px "Outfit", sans-serif';
        var tw = ctx.measureText(text).width;
        var pad = 10;

        ctx.beginPath();
        ctx.roundRect(targetX - tw/2 - pad, badgeY - 14, tw + pad * 2, 24, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, targetX, badgeY - 2);
        ctx.restore();

        await sleep(16);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // =========================================================================
  // 4. MAIN DISPATCHER
  // =========================================================================

  async function playPokeMoveAnimation(actor, moveName, hitResult) {
    var canvas = getOrCreateAnimCanvas();
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    var isStreamer = actor === 'streamer';
    var streamerSpr = document.getElementById('arenaStreamerSprite');
    var viewersSpr = document.getElementById('arenaViewersSprite');
    var targetSpr = isStreamer ? viewersSpr : streamerSpr;

    var canvasRect = canvas.getBoundingClientRect();
    var streamerCenter = getSpriteCenter(streamerSpr, canvasRect);
    var viewersCenter = getSpriteCenter(viewersSpr, canvasRect);

    var userX = isStreamer ? streamerCenter.x : viewersCenter.x;
    var userY = isStreamer ? streamerCenter.y : viewersCenter.y;
    var targetX = isStreamer ? viewersCenter.x : streamerCenter.x;
    var targetY = isStreamer ? viewersCenter.y : streamerCenter.y;

    var m = (moveName || '').trim();

    var animHitFeedback = { soundTriggered: false };

    try {
      // 1. SURF: Genuine EBDX Tsunami Wave
      if (m === '파도타기' || m === '탁류') {
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('PRSFX- Muddy Water.wav');
        await playEbdxSurf(canvas, ctx, userX, userY, targetX, targetY, isStreamer, hitResult, animHitFeedback);
      }
      // 2. PSYCHIC: Genuine EBDX Cosmic Space Distortion & Levitation
      else if (m === '사이코키네시스' || m === '사이코쇼크') {
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('PRSFX- Psychic.wav');
        await playEbdxPsychic(canvas, ctx, targetX, targetY, isStreamer, hitResult, animHitFeedback);
      }
      // 3. EARTHQUAKE: Genuine EBDX Scene-Wide Fissure & Magnitude 24 Rumble
      else if (m === '지진') {
        if (window.pokeSoundEngine) window.pokeSoundEngine.playSe('PRSFX- Earthquake.wav');
        await playEbdxEarthquake(canvas, ctx, userX, userY, targetX, targetY, isStreamer, hitResult, animHitFeedback);
      }
      // 4. ALL OTHER 71 MOVES: Genuine Gen 4/5 NDS Multi-Frame Particle Sequences + EBDX Atmosphere
      else {
        await playNdsParticleAnim(canvas, ctx, userX, userY, targetX, targetY, isStreamer, m, hitResult, animHitFeedback);
      }
    } catch(err) {
      console.error('[PokeMoveAnim Error]', err);
    } finally {
      await finishHitFeedback(targetSpr, hitResult, canvas, ctx, targetX, targetY, animHitFeedback);
    }
  }

  function testPokeAnim(moveName, actor) {
    actor = actor || 'streamer';
    moveName = moveName || '파도타기';
    console.log('[PokeAnim Test] Playing: ' + moveName + ' by ' + actor);
    return playPokeMoveAnimation(actor, moveName, { hit: true, isCrit: false, typeMult: 2.0 });
  }

  window.playPokeMoveAnimation = playPokeMoveAnimation;
  window.playPokerogueMoveAnim = playPokeMoveAnimation;
  window.testPokeAnim = testPokeAnim;

  console.log('[PokeAnim Engine] Master Gen 4/5 & EBDX Battle Animation Engine initialized.');
})();
