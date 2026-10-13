/* =========================================================================
   1. GLOBAL STATE & PARAMETERS
   ========================================================================= */
let audioCtx = null;
let masterGainNode = null;
let analyserNode = null;
let micStream = null;
let micSourceNode = null;
let animFrameId = null;

// Teachable Machine Recognizer State
let recognizer = null;
let isListening = false;
let isCustomModelLoaded = false;
let recognizedClasses = ['_background_noise_', '電車・交通', 'タイピング・会話', '衝撃音・雷', '雨・水流・虫'];

// Default Class-to-Theme Mapping
let classThemeMapping = {
  '_background_noise_': 'mute',
  '電車・交通': 'lofi',
  'タイピング・会話': 'piano',
  '衝撃音・雷': 'meditation',
  '雨・水流・虫': 'zen'
};

// User settings
let thresholdRatio = 0.70;
let crossfadeDuration = 2.5; // seconds
let holdDuration = 6.0; // seconds
let masterVolumeRatio = 0.50;

// Active Theme & Masking Tracker
let currentThemeKey = 'mute'; // 'lofi' | 'piano' | 'meditation' | 'zen' | 'mute'
let holdTimer = null;
let holdSecondsRemaining = 0;
let activeDetectedNoiseName = 'なし';

// Theme Meta Definition (colors, descriptions, icons)
const THEME_META = {
  'mute': {
    name: '静穏 (Muted)',
    icon: 'ph-ear',
    color: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.15)',
    badgeText: '#cbd5e1',
    desc: '雑音は検知されていません。部屋が静かな状態です。'
  },
  'lofi': {
    name: 'Warm Lo-Fi Chill',
    icon: 'ph-coffee',
    color: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeText: '#fcd34d',
    desc: 'エレクトリックピアノの甘い和音とアナログテープノイズによる温かなマスキング。'
  },
  'piano': {
    name: 'Ambient Piano & Soft Harp',
    icon: 'ph-keyboard',
    color: '#a855f7',
    badgeBg: 'rgba(168, 85, 247, 0.15)',
    badgeText: '#d8b4fe',
    desc: '静けさを醸し出すペンタトニックの分散和音とリバーブドローン。'
  },
  'meditation': {
    name: 'Deep Sub Meditation & Bowl',
    icon: 'ph-sparkle',
    color: '#06b6d4',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    badgeText: '#67e8f9',
    desc: '突発的な不快感を包み込む、重低音サブドローンと倍音クリスタルボウル。'
  },
  'zen': {
    name: 'Acoustic Zen Chimes & Pad',
    icon: 'ph-leaf',
    color: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeText: '#6ee7b7',
    desc: '自然界のホワイトノイズに寄り添う、穏やかな風鈴と温もりのあるアンビエントパッド。'
  }
};

/* =========================================================================
   2. PROCEDURAL SOUND GENERATORS (Web Audio API Synthesizers)
   ========================================================================= */
const soundNodes = {
  lofi: { gainNode: null, activeNodes: [], customAudio: null },
  piano: { gainNode: null, activeNodes: [], customAudio: null, interval: null },
  meditation: { gainNode: null, activeNodes: [], customAudio: null },
  zen: { gainNode: null, activeNodes: [], customAudio: null, interval: null }
};

function initAudioEngine() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();

  // Master Gain
  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.setValueAtTime(masterVolumeRatio, audioCtx.currentTime);
  masterGainNode.connect(audioCtx.destination);

  // Create individual theme gain buses
  ['lofi', 'piano', 'meditation', 'zen'].forEach(theme => {
    const themeGain = audioCtx.createGain();
    themeGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    themeGain.connect(masterGainNode);
    soundNodes[theme].gainNode = themeGain;
  });

  // Start the 4 background procedural generation tracks
  setupLoFiSynth(soundNodes.lofi.gainNode);
  setupPianoEngine(soundNodes.piano.gainNode);
  setupMeditationSynth(soundNodes.meditation.gainNode);
  setupZenEngine(soundNodes.zen.gainNode);
}

// THEME 1: Warm Lo-Fi Chill (Rhodes Chord Progression + Vinyl Crackle)
function setupLoFiSynth(outputNode) {
  const now = audioCtx.currentTime;

  // 1. Vinyl tape crackle & low murmur
  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    // Brown noise + random crackle spikes
    lastOut = (lastOut + (0.02 * white)) / 1.02;
    const crackle = Math.random() > 0.997 ? (Math.random() * 0.4 - 0.2) : 0;
    output[i] = (lastOut * 0.8) + crackle;
  }
  const vinylSource = audioCtx.createBufferSource();
  vinylSource.buffer = noiseBuffer;
  vinylSource.loop = true;

  const vinylFilter = audioCtx.createBiquadFilter();
  vinylFilter.type = 'bandpass';
  vinylFilter.frequency.setValueAtTime(1200, now);
  vinylFilter.Q.setValueAtTime(0.8, now);

  const vinylGain = audioCtx.createGain();
  vinylGain.gain.setValueAtTime(0.06, now);

  vinylSource.connect(vinylFilter);
  vinylFilter.connect(vinylGain);
  vinylGain.connect(outputNode);
  vinylSource.start();
  soundNodes.lofi.activeNodes.push(vinylSource);

  // 2. Warm Electric Piano chords (Cmaj9 - Am7 progression loop)
  const chordNotes = [
    [130.81, 196.00, 246.94, 293.66], // C, G, B, D
    [110.00, 164.81, 220.00, 261.63], // A, E, A, C
    [146.83, 220.00, 261.63, 329.63], // D, A, C, E
    [98.00, 146.83, 196.00, 246.94]   // G, D, G, B
  ];

  chordNotes[0].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Slow vibrato
    const vib = audioCtx.createOscillator();
    const vibGain = audioCtx.createGain();
    vib.frequency.setValueAtTime(4.2, now);
    vibGain.gain.setValueAtTime(1.5, now);
    vib.connect(osc.frequency);
    vib.start();

    oscGain.gain.setValueAtTime(0.08, now);
    osc.connect(oscGain);
    oscGain.connect(outputNode);
    osc.start();
    soundNodes.lofi.activeNodes.push(osc, vib);
  });
}

// THEME 2: Ambient Calm Piano & Soft Harp (Gentle Pentatonic Arpeggiator)
function setupPianoEngine(outputNode) {
  // Pentatonic Scale in Eb major: Eb4, F4, G4, Bb4, C5, Eb5
  const scale = [311.13, 349.23, 392.00, 466.16, 523.25, 622.25];

  // Reverb-like feedback delay for dreamy harp tail
  const delay = audioCtx.createDelay();
  delay.delayTime.setValueAtTime(0.45, audioCtx.currentTime);
  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.setValueAtTime(0.35, audioCtx.currentTime);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(outputNode);

  // Generative harp note trigger
  soundNodes.piano.interval = setInterval(() => {
    if (!audioCtx || soundNodes.piano.gainNode.gain.value < 0.01) return;
    const now = audioCtx.currentTime;
    const freq = scale[Math.floor(Math.random() * scale.length)];

    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Gentle pluck envelope
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(0.09, now + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

    osc.connect(noteGain);
    noteGain.connect(outputNode);
    noteGain.connect(delay);

    osc.start(now);
    osc.stop(now + 2.3);
  }, 750);
}

// THEME 3: Deep Sub Meditation Drone & Crystal Bowl
function setupMeditationSynth(outputNode) {
  const now = audioCtx.currentTime;

  // Heavy 60Hz and 90Hz calming grounded drone
  [55.0, 82.5, 110.0].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(idx === 0 ? 0.22 : 0.08, now);

    osc.connect(gain);
    gain.connect(outputNode);
    osc.start();
    soundNodes.meditation.activeNodes.push(osc);
  });

  // Crystal singing bowl overtone with binaural pulse
  const bowlOsc1 = audioCtx.createOscillator();
  const bowlOsc2 = audioCtx.createOscillator();
  const bowlGain = audioCtx.createGain();

  bowlOsc1.type = 'sine';
  bowlOsc2.type = 'sine';
  bowlOsc1.frequency.setValueAtTime(432.0, now);
  bowlOsc2.frequency.setValueAtTime(436.5, now); // 4.5Hz Theta wave beat

  bowlGain.gain.setValueAtTime(0.04, now);
  bowlOsc1.connect(bowlGain);
  bowlOsc2.connect(bowlGain);
  bowlGain.connect(outputNode);

  bowlOsc1.start();
  bowlOsc2.start();
  soundNodes.meditation.activeNodes.push(bowlOsc1, bowlOsc2);
}

// THEME 4: Acoustic Zen Chimes & Pad
function setupZenEngine(outputNode) {
  const now = audioCtx.currentTime;

  // Warm soothing continuous background pad
  const padFreqs = [174.61, 220.00, 261.63, 329.63]; // Fmaj7
  padFreqs.forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);

    gain.gain.setValueAtTime(0.05, now);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(outputNode);
    osc.start();
    soundNodes.zen.activeNodes.push(osc);
  });

  // Occasional peaceful bamboo wind chimes
  const chimeFreqs = [880.0, 987.77, 1174.66, 1318.51, 1567.98];
  soundNodes.zen.interval = setInterval(() => {
    if (!audioCtx || soundNodes.zen.gainNode.gain.value < 0.01) return;
    if (Math.random() > 0.45) return; // natural irregularity

    const t = audioCtx.currentTime;
    const chimeFreq = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(chimeFreq, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

    osc.connect(gain);
    gain.connect(outputNode);
    osc.start(t);
    osc.stop(t + 1.9);
  }, 1200);
}

/* =========================================================================
   3. INTELLIGENT CROSSFADING ENGINE
   ========================================================================= */
function crossfadeToTheme(newThemeKey, triggeredNoiseName = null) {
  initAudioEngine();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const targetDuration = Math.max(0.2, crossfadeDuration);
  const isSwitching = currentThemeKey !== newThemeKey;

  if (isSwitching) {
    document.getElementById('liveCrossfadeFlag').classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('liveCrossfadeFlag').classList.add('hidden');
    }, targetDuration * 1000);
  }

  currentThemeKey = newThemeKey;
  activeDetectedNoiseName = triggeredNoiseName || (newThemeKey === 'mute' ? 'なし' : '手動選択');

  // Update gains across all 4 theme buses
  const themes = ['lofi', 'piano', 'meditation', 'zen'];
  themes.forEach(theme => {
    const bus = soundNodes[theme];
    if (!bus || !bus.gainNode) return;

    const g = bus.gainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);

    if (theme === newThemeKey) {
      // Fade IN to full theme volume (1.0)
      g.exponentialRampToValueAtTime(1.0, now + targetDuration);
    } else {
      // Fade OUT to silent threshold
      g.exponentialRampToValueAtTime(0.0001, now + targetDuration);
    }
  });

  // Update custom uploaded audio elements if playing
  themes.forEach(theme => {
    if (soundNodes[theme].customAudio) {
      if (theme === newThemeKey) {
        soundNodes[theme].customAudio.play().catch(() => {});
      } else {
        setTimeout(() => {
          if (currentThemeKey !== theme && soundNodes[theme].customAudio) {
            soundNodes[theme].customAudio.pause();
          }
        }, targetDuration * 1000);
      }
    }
  });

  // Update UI Themes & Glow
  updateThemeDisplayUI(newThemeKey);

  // Handle Hold Timer (decay back to mute if not already mute)
  if (newThemeKey !== 'mute') {
    holdSecondsRemaining = holdDuration;
    updateHoldTimerUI();

    if (holdTimer) clearInterval(holdTimer);
    holdTimer = setInterval(() => {
      holdSecondsRemaining--;
      updateHoldTimerUI();
      if (holdSecondsRemaining <= 0) {
        clearInterval(holdTimer);
        holdTimer = null;
        // Naturally fade out back to silence
        crossfadeToTheme('mute');
        logTimelineEvent('マスキング完了 (フェードアウト)', 1.0, true);
      }
    }, 1000);
  } else {
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    holdSecondsRemaining = 0;
    updateHoldTimerUI();
  }
}

function updateHoldTimerUI() {
  const el = document.getElementById('detectedHoldStatus');
  if (holdSecondsRemaining > 0) {
    el.textContent = `維持: ${holdSecondsRemaining}s`;
    el.className = 'text-[11px] font-mono text-teal-300 font-bold';
  } else {
    el.textContent = '維持: -';
    el.className = 'text-[11px] font-mono text-slate-500';
  }
}

function updateThemeDisplayUI(themeKey) {
  const meta = THEME_META[themeKey] || THEME_META['mute'];
  const card = document.getElementById('mainStatusCard');
  const avatar = document.getElementById('themeAvatar');
  const avatarIcon = document.getElementById('themeAvatarIcon');
  const title = document.getElementById('currentThemeTitle');
  const desc = document.getElementById('currentThemeDesc');
  const badge = document.getElementById('activeThemeBadge');
  const orb1 = document.getElementById('ambientOrb1');

  // Border and Avatar
  card.style.borderTopColor = meta.color;
  avatar.style.borderColor = meta.color;
  avatar.style.color = meta.color;
  avatarIcon.className = `ph-duotone ${meta.icon} text-3xl`;

  title.textContent = meta.name;
  title.style.color = themeKey === 'mute' ? '#ffffff' : meta.color;
  desc.textContent = meta.desc;

  badge.textContent = `Theme: ${meta.name.split(' ')[0]}`;
  badge.style.backgroundColor = meta.badgeBg;
  badge.style.color = meta.badgeText;
  badge.style.borderColor = meta.color;

  // Glow light shift
  orb1.style.backgroundColor = meta.color;

  // Update Individual Theme Monitor Gain Bars
  const themes = ['lofi', 'piano', 'meditation', 'zen'];
  themes.forEach(t => {
    const bar = document.getElementById(`gainBar${capitalize(t)}`);
    const text = document.getElementById(`gainText${capitalize(t)}`);
    const box = document.getElementById(`cardTheme${capitalize(t)}`);

    if (t === themeKey) {
      bar.style.width = '100%';
      text.textContent = '100%';
      text.className = 'text-[10px] font-mono text-white font-bold';
      box.style.borderColor = meta.color;
      box.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    } else {
      bar.style.width = '0%';
      text.textContent = '0%';
      text.className = 'text-[10px] font-mono text-slate-500';
      box.style.borderColor = 'rgba(255, 255, 255, 0.05)';
      box.style.backgroundColor = 'rgba(13, 17, 26, 0.9)';
    }
  });
}

function capitalize(str) {
  if (str === 'lofi') return 'LoFi';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =========================================================================
   4. AUDIO VISUALIZER & MIC ANALYZER
   ========================================================================= */
function setupVisualizer(stream) {
  initAudioEngine();
  micStream = stream;

  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 128;
  micSourceNode = audioCtx.createMediaStreamSource(stream);
  micSourceNode.connect(analyserNode);

  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  document.getElementById('visualizerOverlay').classList.add('hidden');

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(dataArray);

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    ctx.fillStyle = '#0d111a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const currentMeta = THEME_META[currentThemeKey] || THEME_META['mute'];
    const barWidth = (canvas.width / bufferLength) * 1.5;
    let x = 0;
    let sum = 0;

    // Draw frequency spectrum
    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      sum += val;
      const barHeight = (val / 255) * canvas.height * 0.88;

      const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      grad.addColorStop(1, currentMeta.color);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, [2, 2, 0, 0]);
      ctx.fill();

      x += barWidth;
    }

    const avg = sum / bufferLength;
    const dbApprox = avg > 0 ? Math.round(20 * Math.log10(avg / 255)) : -60;
    document.getElementById('micDbDisplay').textContent = `${dbApprox} dBFS`;

    // If no TM model loaded, fallback to frequency-band energy heuristic
    if (!isCustomModelLoaded && isListening) {
      analyzeFrequencyBands(dataArray, avg);
    }
  }
  draw();
}

// Heuristic band energy simulator when TM model is not yet connected
let bandTick = 0;
function analyzeFrequencyBands(dataArray, overallAvg) {
  bandTick++;
  if (bandTick % 8 !== 0) return; // rate limit

  const normalized = Math.min(1.0, overallAvg / 140);
  const simulatedScores = [0, 0, 0, 0, 0];

  if (normalized < (thresholdRatio * 0.35)) {
    // Quiet
    simulatedScores[0] = 0.95;
  } else {
    // Detect dominant frequency band:
    // Low: 0-8 (Traffic/Train), Mid: 9-28 (Voice/Typing), High: 29-64 (Chimes/Rain/Click)
    let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
    for (let i = 0; i < 8; i++) lowEnergy += dataArray[i];
    for (let i = 8; i < 28; i++) midEnergy += dataArray[i];
    for (let i = 28; i < 60; i++) highEnergy += dataArray[i];

    lowEnergy /= 8;
    midEnergy /= 20;
    highEnergy /= 32;

    const maxEnergy = Math.max(lowEnergy, midEnergy, highEnergy);
    const score = Math.min(0.98, (maxEnergy / 220) * 1.2);

    if (maxEnergy === lowEnergy) {
      simulatedScores[1] = score; // 電車・交通
    } else if (maxEnergy === midEnergy) {
      simulatedScores[2] = score; // タイピング・会話
    } else {
      simulatedScores[4] = score; // 雨・虫
    }
    simulatedScores[0] = Math.max(0.02, 1.0 - score);

    // Check if exceeded sensitivity threshold
    if (score >= thresholdRatio) {
      const detectedClassIndex = simulatedScores.indexOf(score);
      const detectedClassName = recognizedClasses[detectedClassIndex];
      const mappedTheme = classThemeMapping[detectedClassName] || 'lofi';

      crossfadeToTheme(mappedTheme, detectedClassName);
      logTimelineEvent(`${detectedClassName} を検知 (周波数解析)`, score);
    }
  }

  renderProbabilitiesUI(recognizedClasses, simulatedScores);
}

function stopVisualizer() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  document.getElementById('visualizerOverlay').classList.remove('hidden');
  document.getElementById('micDbDisplay').textContent = '-∞ dB';
}

/* =========================================================================
   5. TEACHABLE MACHINE AUDIO MODEL INTEGRATION
   ========================================================================= */
async function loadTeachableMachineModel(modelUrl) {
  const msg = document.getElementById('modelStatusMsg');
  msg.classList.remove('hidden', 'text-emerald-400', 'text-rose-400');
  msg.className = 'text-xs font-mono text-teal-400 block';
  msg.textContent = 'モデルをダウンロード & ロード中...';

  try {
    const cleanUrl = modelUrl.endsWith('/') ? modelUrl : modelUrl + '/';
    const checkpointURL = cleanUrl + 'model.json';
    const metadataURL = cleanUrl + 'metadata.json';

    recognizer = speechCommands.create(
      'BROWSER_FFT',
      undefined,
      checkpointURL,
      metadataURL
    );

    await recognizer.ensureModelLoaded();
    recognizedClasses = recognizer.wordLabels();
    isCustomModelLoaded = true;

    document.getElementById('modelIndicatorBadge').textContent = 'TM カスタムモデル稼働中';
    document.getElementById('modelIndicatorBadge').className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';

    msg.textContent = `✓ 接続成功: ${recognizedClasses.length} クラスを認識`;
    msg.className = 'text-xs font-mono text-emerald-400 block';

    // Auto-assign smart default mapping for newly discovered classes
    rebuildClassMappingTable();
    renderProbabilitiesUI(recognizedClasses);
    logTimelineEvent('Teachable Machineモデルを連携しました', 1.0, true);
  } catch (err) {
    console.error(err);
    msg.textContent = '❌ 接続失敗: 正しいTeachable Machine公開URLを入力してください';
    msg.className = 'text-xs font-mono text-rose-400 block';
  }
}

function rebuildClassMappingTable() {
  const container = document.getElementById('mappingContainer');
  container.innerHTML = '';

  recognizedClasses.forEach((className) => {
    // Auto default matching guess if not mapped
    if (!classThemeMapping[className]) {
      const lower = className.toLowerCase();
      if (className === '_background_noise_' || lower.includes('quiet') || lower.includes('silence')) {
        classThemeMapping[className] = 'mute';
      } else if (lower.includes('rain') || lower.includes('water') || lower.includes('insect') || lower.includes('雨')) {
        classThemeMapping[className] = 'zen';
      } else if (lower.includes('clatter') || lower.includes('impact') || lower.includes('clap') || lower.includes('衝撃') || lower.includes('雷')) {
        classThemeMapping[className] = 'meditation';
      } else if (lower.includes('type') || lower.includes('talk') || lower.includes('voice') || lower.includes('会話')) {
        classThemeMapping[className] = 'piano';
      } else {
        classThemeMapping[className] = 'lofi';
      }
    }

    const currentAssignedTheme = classThemeMapping[className];

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p.2.5 rounded-xl bg-surface-900 border border-white/5 text-xs';
    row.innerHTML = `
      <div class="flex items-center gap-2 truncate pr-2">
        <span class="w-2 h-2 rounded-full ${className === '_background_noise_' ? 'bg-slate-500' : 'bg-teal-400'} shrink-0"></span>
        <span class="font-mono text-slate-200 truncate font-medium">${className}</span>
      </div>
      <select data-class="${className}" class="theme-select bg-surface-800 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-teal-400">
        <option value="mute" ${currentAssignedTheme === 'mute' ? 'selected' : ''}>静寂 / ミュート</option>
        <option value="lofi" ${currentAssignedTheme === 'lofi' ? 'selected' : ''}>1. Lo-Fi Chill</option>
        <option value="piano" ${currentAssignedTheme === 'piano' ? 'selected' : ''}>2. Soft Piano</option>
        <option value="meditation" ${currentAssignedTheme === 'meditation' ? 'selected' : ''}>3. Deep Drone</option>
        <option value="zen" ${currentAssignedTheme === 'zen' ? 'selected' : ''}>4. Zen Chimes</option>
      </select>
    `;
    container.appendChild(row);
  });

  // Bind change listeners
  container.querySelectorAll('.theme-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const cls = e.target.getAttribute('data-class');
      classThemeMapping[cls] = e.target.value;
      logTimelineEvent(`紐付け更新: [${cls}] → ${THEME_META[e.target.value].name}`, 1.0, true);
    });
  });
}

function renderProbabilitiesUI(classes, scores = null) {
  const list = document.getElementById('probabilitiesList');
  list.innerHTML = '';

  classes.forEach((className, idx) => {
    const score = scores ? scores[idx] : 0;
    const percent = Math.round(score * 100);
    const mappedTheme = classThemeMapping[className] || 'mute';
    const isTriggered = (score >= thresholdRatio) && (mappedTheme !== 'mute');
    const meta = THEME_META[mappedTheme];

    const row = document.createElement('div');
    row.className = 'space-y-1';
    row.innerHTML = `
      <div class="flex justify-between items-center text-xs">
        <span class="flex items-center gap-1.5 truncate ${isTriggered ? 'text-white font-bold' : 'text-slate-300'}">
          <span class="w-2 h-2 rounded-full ${isTriggered ? 'animate-ping' : ''}" style="background-color: ${meta.color};"></span>
          <span class="truncate">${className}</span>
          <span class="text-[10px] text-slate-400 font-mono">(${meta.name.split(' ')[0]})</span>
        </span>
        <span class="font-mono text-xs ${isTriggered ? 'font-bold' : 'text-slate-400'}" style="color: ${isTriggered ? meta.color : ''}">${percent}%</span>
      </div>
      <div class="h-2 w-full bg-surface-900 rounded-full overflow-hidden border border-white/5 relative">
        <div class="h-full rounded-full transition-all duration-150" style="width: ${percent}%; background-color: ${meta.color};"></div>
        <div class="absolute top-0 bottom-0 border-r border-amber-400/60 z-10" style="left: ${thresholdRatio * 100}%;" title="しきい値"></div>
      </div>
    `;
    list.appendChild(row);
  });
}

async function startMicListening() {
  initAudioEngine();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    setupVisualizer(stream);

    if (isCustomModelLoaded && recognizer) {
      recognizer.listen(result => {
        const scores = Array.from(result.scores);
        renderProbabilitiesUI(recognizedClasses, scores);

        // Find highest scored non-background class
        let topScore = 0;
        let topClass = '';
        for (let i = 0; i < scores.length; i++) {
          const cls = recognizedClasses[i];
          if (cls !== '_background_noise_' && scores[i] > topScore) {
            topScore = scores[i];
            topClass = cls;
          }
        }

        if (topScore >= thresholdRatio) {
          const themeToPlay = classThemeMapping[topClass] || 'lofi';
          crossfadeToTheme(themeToPlay, topClass);
          logTimelineEvent(`${topClass} をAI検知`, topScore);
        }
      }, {
        includeSpectrogram: false,
        probabilityThreshold: 0.05,
        overlapFactor: 0.50
      });
    }

    isListening = true;
    updateListeningUI(true);
  } catch (err) {
    console.error('Mic access error:', err);
    alert('マイクへのアクセスが許可されませんでした。設定からマイク権限を許可してください。');
  }
}

function stopMicListening() {
  if (recognizer && recognizer.isListening()) {
    recognizer.stopListening();
  }
  stopVisualizer();
  crossfadeToTheme('mute');

  isListening = false;
  updateListeningUI(false);
}

function updateListeningUI(active) {
  const btn = document.getElementById('toggleListenBtn');
  const icon = document.getElementById('listenBtnIcon');
  const text = document.getElementById('listenBtnText');
  const badgeDot = document.getElementById('engineBadgeDot');
  const badgeText = document.getElementById('engineBadgeText');

  if (active) {
    btn.className = 'px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold shadow-lg shadow-rose-500/25 active:scale-95 transition-all flex items-center gap-2';
    icon.className = 'ph-bold ph-stop';
    text.textContent = '監視を停止';
    badgeDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    badgeText.textContent = 'マイク: 監視中';
  } else {
    btn.className = 'px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-lg shadow-teal-500/25 active:scale-95 transition-all flex items-center gap-2';
    icon.className = 'ph-bold ph-play';
    text.textContent = '監視を開始する';
    badgeDot.className = 'w-2 h-2 rounded-full bg-slate-500';
    badgeText.textContent = 'マイク: 停止中';
  }
}

let lastLogTitle = '';
let lastLogTime = 0;
function logTimelineEvent(title, confidence = 1.0, isSys = false) {
  const now = Date.now();
  if (!isSys && title === lastLogTitle && (now - lastLogTime < 3500)) return;
  lastLogTitle = title;
  lastLogTime = now;

  const container = document.getElementById('eventLogList');
  if (container.querySelector('.text-slate-500')) {
    container.innerHTML = '';
  }

  const timeStr = new Date().toLocaleTimeString();
  const meta = THEME_META[currentThemeKey] || THEME_META['mute'];
  const item = document.createElement('div');
  item.className = 'flex items-center justify-between py-1 border-b border-white/5';

  if (isSys) {
    item.innerHTML = `<span class="text-teal-400">[INFO] ${title}</span><span class="text-slate-500 text-[10px]">${timeStr}</span>`;
  } else {
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${meta.color};"></span>
        <span class="text-slate-200">${title}</span>
        <span class="text-slate-400 text-[10px]">(${Math.round(confidence * 100)}%)</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded" style="background-color: ${meta.badgeBg}; color: ${meta.badgeText};">→ ${meta.name.split(' ')[0]}</span>
      </div>
      <span class="text-slate-500 text-[10px]">${timeStr}</span>
    `;
  }
  container.prepend(item);
}

/* =========================================================================
   6. DOM EVENT LISTENERS & INITIALIZATION
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  // Rebuild Default Mapping UI and bars
  rebuildClassMappingTable();
  renderProbabilitiesUI(recognizedClasses);
  updateThemeDisplayUI('mute');

  // Microphone Toggle
  document.getElementById('toggleListenBtn').addEventListener('click', () => {
    if (!isListening) {
      startMicListening();
    } else {
      stopMicListening();
    }
  });

  // Quick Simulation Buttons (Instant Testing)
  document.getElementById('simTrainBtn').addEventListener('click', () => {
    crossfadeToTheme('lofi', '電車・重低音 (シミュレーション)');
    logTimelineEvent('電車・重低音をシミュレート検知', 0.94);
  });
  document.getElementById('simTypingBtn').addEventListener('click', () => {
    crossfadeToTheme('piano', 'タイピング・会話 (シミュレーション)');
    logTimelineEvent('タイピング・会話をシミュレート検知', 0.91);
  });
  document.getElementById('simImpactBtn').addEventListener('click', () => {
    crossfadeToTheme('meditation', '衝撃音・雷 (シミュレーション)');
    logTimelineEvent('突発衝撃音をシミュレート検知', 0.96);
  });
  document.getElementById('simNatureBtn').addEventListener('click', () => {
    crossfadeToTheme('zen', '雨・水流・虫 (シミュレーション)');
    logTimelineEvent('雨・流水音をシミュレート検知', 0.88);
  });
  document.getElementById('simQuietBtn').addEventListener('click', () => {
    crossfadeToTheme('mute');
    logTimelineEvent('静寂をシミュレート (ミュートへフェード)', 1.0, true);
  });

  // Model Loading URL
  document.getElementById('loadModelBtn').addEventListener('click', () => {
    const url = document.getElementById('modelUrlInput').value.trim();
    if (url) loadTeachableMachineModel(url);
  });

  // Reset Mapping
  document.getElementById('resetMappingBtn').addEventListener('click', () => {
    classThemeMapping = {
      '_background_noise_': 'mute',
      '電車・交通': 'lofi',
      'タイピング・会話': 'piano',
      '衝撃音・雷': 'meditation',
      '雨・水流・虫': 'zen'
    };
    rebuildClassMappingTable();
    logTimelineEvent('マッピングを初期値にリセットしました', 1.0, true);
  });

  // Sliders
  const thresholdSlider = document.getElementById('thresholdSlider');
  thresholdSlider.addEventListener('input', (e) => {
    thresholdRatio = parseInt(e.target.value, 10) / 100;
    document.getElementById('thresholdValText').textContent = `${e.target.value}%`;
    renderProbabilitiesUI(recognizedClasses);
  });

  const fadeSpeedSlider = document.getElementById('fadeSpeedSlider');
  fadeSpeedSlider.addEventListener('input', (e) => {
    crossfadeDuration = parseFloat(e.target.value);
    document.getElementById('fadeSpeedValText').textContent = `${crossfadeDuration.toFixed(1)} 秒`;
  });

  const holdDurationSlider = document.getElementById('holdDurationSlider');
  holdDurationSlider.addEventListener('input', (e) => {
    holdDuration = parseInt(e.target.value, 10);
    document.getElementById('holdDurationValText').textContent = `${holdDuration} 秒`;
  });

  const masterVolumeSlider = document.getElementById('masterVolumeSlider');
  masterVolumeSlider.addEventListener('input', (e) => {
    masterVolumeRatio = parseInt(e.target.value, 10) / 100;
    document.getElementById('masterVolumeValText').textContent = `${e.target.value}%`;
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setValueAtTime(masterVolumeRatio, audioCtx.currentTime);
    }
  });

  // Preset vs Custom Audio File Toggle
  const modePresetSynthBtn = document.getElementById('modePresetSynthBtn');
  const modeCustomFilesBtn = document.getElementById('modeCustomFilesBtn');
  const customSection = document.getElementById('customFilesSection');

  modePresetSynthBtn.addEventListener('click', () => {
    modePresetSynthBtn.className = 'p-2.5 rounded-xl border border-teal-500/40 bg-teal-500/10 text-white text-xs font-medium flex items-center justify-center gap-2 transition-all';
    modeCustomFilesBtn.className = 'p-2.5 rounded-xl border border-white/10 bg-surface-900/60 hover:bg-surface-800 text-slate-400 text-xs font-medium flex items-center justify-center gap-2 transition-all';
    customSection.classList.add('hidden');
  });

  modeCustomFilesBtn.addEventListener('click', () => {
    modeCustomFilesBtn.className = 'p-2.5 rounded-xl border border-teal-500/40 bg-teal-500/10 text-white text-xs font-medium flex items-center justify-center gap-2 transition-all';
    modePresetSynthBtn.className = 'p-2.5 rounded-xl border border-white/10 bg-surface-900/60 hover:bg-surface-800 text-slate-400 text-xs font-medium flex items-center justify-center gap-2 transition-all';
    customSection.classList.remove('hidden');
  });

  // Custom Audio File Inputs
  document.querySelectorAll('.custom-file-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const themeKey = e.target.getAttribute('data-theme');
      const file = e.target.files[0];
      if (file) {
        initAudioEngine();
        const url = URL.createObjectURL(file);
        const audioElem = new Audio();
        audioElem.loop = true;
        audioElem.src = url;

        const sourceNode = audioCtx.createMediaElementSource(audioElem);
        sourceNode.connect(soundNodes[themeKey].gainNode);
        soundNodes[themeKey].customAudio = audioElem;

        logTimelineEvent(`[${THEME_META[themeKey].name}] に自作音源を登録: ${file.name}`, 1.0, true);
      }
    });
  });

  // Guide Modal
  const modal = document.getElementById('guideModal');
  document.getElementById('guideBtn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('closeGuideBtn').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('closeGuideBottomBtn').addEventListener('click', () => modal.classList.add('hidden'));

  // Clear Log
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    document.getElementById('eventLogList').innerHTML = '<div class="text-slate-500 py-1">ログを消去しました。</div>';
  });
});