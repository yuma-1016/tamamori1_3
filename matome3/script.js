/* =========================================================================
   自動読み込みと基本設定
   ========================================================================= */
const AUTO_LOAD_MODEL_URL = 'https://teachablemachine.withgoogle.com/models/gCFPnk_3A/'; 

let audioCtx = null;
let masterGainNode = null;
let analyserNode = null;
let micStream = null;
let micSourceNode = null;
let animFrameId = null;
let recognizer = null;
let isListening = false;

// 連続検知（チャタリング防止）用パラメータ
let sustainedCandidateClass = null; 
let sustainedHitCount = 0;          
const REQUIRED_SUSTAINED_HITS = 3;  

// ユーザー設定
let thresholdRatio = 0.70;
let crossfadeDuration = 2.5; 
let masterVolumeRatio = 0.50;

let currentThemeKey = 'mute'; 

// デザイン用テーマ定義
const THEME_META = {
  'mute': {
    name: '待機中',
    icon: 'ph-speaker-none',
    color: '#cbd5e1', // slate-300
    glow: 'rgba(241, 245, 249, 0.5)',
    desc: 'スタートを押すと、環境音のカバーを開始します。'
  },
  'meditation': { // 低音用
    name: '低音カバー',
    icon: 'ph-waves',
    color: '#60a5fa', // blue-400
    glow: 'rgba(96, 165, 250, 0.15)',
    desc: '足音やドアの音など、低い音を和らげています。'
  },
  'piano': { // 中音用
    name: '中音カバー',
    icon: 'ph-wind',
    color: '#fbbf24', // amber-400
    glow: 'rgba(251, 191, 36, 0.15)',
    desc: '話し声やタイピング音を和らげています。'
  },
  'zen': { // 高音用
    name: '高音カバー',
    icon: 'ph-sparkle',
    color: '#34d399', // emerald-400
    glow: 'rgba(52, 211, 153, 0.15)',
    desc: '食器の音など、甲高い音を和らげています。'
  }
};

/* =========================================================================
   サウンドエンジン
   ========================================================================= */
const soundNodes = {
  piano: { gainNode: null, interval: null },
  meditation: { gainNode: null },
  zen: { gainNode: null, interval: null }
};

function initAudioEngine() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.setValueAtTime(masterVolumeRatio, audioCtx.currentTime);
  masterGainNode.connect(audioCtx.destination);

  ['piano', 'meditation', 'zen'].forEach(theme => {
    const themeGain = audioCtx.createGain();
    themeGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    themeGain.connect(masterGainNode);
    soundNodes[theme].gainNode = themeGain;
  });

  setupPianoEngine(soundNodes.piano.gainNode);
  setupMeditationSynth(soundNodes.meditation.gainNode);
  setupZenEngine(soundNodes.zen.gainNode);
}

// 中音（ピアノ・ハープ系）
function setupPianoEngine(outputNode) {
  const scale = [311.13, 349.23, 392.00, 466.16, 523.25, 622.25];
  const delay = audioCtx.createDelay();
  delay.delayTime.setValueAtTime(0.45, audioCtx.currentTime);
  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.setValueAtTime(0.35, audioCtx.currentTime);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(outputNode);

  soundNodes.piano.interval = setInterval(() => {
    if (!audioCtx || soundNodes.piano.gainNode.gain.value < 0.01) return;
    const now = audioCtx.currentTime;
    const freq = scale[Math.floor(Math.random() * scale.length)];
    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
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

// 低音（ディープドローン）
function setupMeditationSynth(outputNode) {
  const now = audioCtx.currentTime;
  [55.0, 82.5, 110.0].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(idx === 0 ? 0.22 : 0.08, now);
    osc.connect(gain);
    gain.connect(outputNode);
    osc.start();
  });
}

// 高音（アンビエントパッド＆チャイム）
function setupZenEngine(outputNode) {
  const now = audioCtx.currentTime;
  const padFreqs = [174.61, 220.00, 261.63, 329.63];
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
  });

  const chimeFreqs = [880.0, 987.77, 1174.66, 1318.51, 1567.98];
  soundNodes.zen.interval = setInterval(() => {
    if (!audioCtx || soundNodes.zen.gainNode.gain.value < 0.01) return;
    if (Math.random() > 0.45) return;
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
   フェード・切り替え制御
   ========================================================================= */
function crossfadeToTheme(newThemeKey) {
  initAudioEngine();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const targetDuration = Math.max(0.2, crossfadeDuration);
  currentThemeKey = newThemeKey;

  ['piano', 'meditation', 'zen'].forEach(theme => {
    const bus = soundNodes[theme];
    if (!bus || !bus.gainNode) return;
    const g = bus.gainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    if (theme === newThemeKey) {
      g.exponentialRampToValueAtTime(1.0, now + targetDuration);
    } else {
      g.exponentialRampToValueAtTime(0.0001, now + targetDuration);
    }
  });

  updateThemeDisplayUI(newThemeKey);
}

function updateThemeDisplayUI(themeKey) {
  const meta = THEME_META[themeKey] || THEME_META['mute'];
  
  document.getElementById('currentThemeTitle').textContent = meta.name;
  document.getElementById('currentThemeDesc').textContent = meta.desc;
  
  const avatar = document.getElementById('themeAvatar');
  const icon = document.getElementById('themeAvatarIcon');
  const orb = document.getElementById('ambientOrb');

  avatar.style.borderColor = themeKey === 'mute' ? '#f1f5f9' : meta.color;
  icon.className = `ph-fill ${meta.icon} text-5xl relative z-10 transition-all duration-500`;
  icon.style.color = themeKey === 'mute' ? '#cbd5e1' : meta.color;
  orb.style.backgroundColor = meta.glow;
}

/* =========================================================================
   マイク解析・ビジュアライザー
   ========================================================================= */
function setupVisualizer(stream) {
  initAudioEngine();
  micStream = stream;
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 64;
  micSourceNode = audioCtx.createMediaStreamSource(stream);
  micSourceNode.connect(analyserNode);

  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(dataArray);

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255.0;
      const y = canvas.height - (v * canvas.height * 0.8);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    const meta = THEME_META[currentThemeKey];
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fillStyle = currentThemeKey === 'mute' ? '#e2e8f0' : meta.color;
    ctx.fill();
  }
  draw();
}

function stopVisualizer() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* =========================================================================
   モデルと判定ロジック
   ========================================================================= */
async function loadAutoModel() {
  try {
    const cleanUrl = AUTO_LOAD_MODEL_URL.endsWith('/') ? AUTO_LOAD_MODEL_URL : AUTO_LOAD_MODEL_URL + '/';
    recognizer = speechCommands.create('BROWSER_FFT', undefined, cleanUrl + 'model.json', cleanUrl + 'metadata.json');
    await recognizer.ensureModelLoaded();
    console.log("モデル読み込み完了");
  } catch (err) {
    console.error('モデルの読み込みに失敗しました', err);
  }
}

async function startListening() {
  initAudioEngine();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    setupVisualizer(stream);

    // スタート直後は無音にせず、デフォルトで「中音カバー」から開始する
    if (currentThemeKey === 'mute') {
      crossfadeToTheme('piano');
    }

    if (recognizer) {
      recognizer.listen(result => {
        const scores = Array.from(result.scores);
        const labels = recognizer.wordLabels();
        
        let topScore = 0;
        let topClass = '';
        
        // バックグラウンドノイズを無視して、低・中・高の中で一番スコアが高いものを探す
        for (let i = 0; i < scores.length; i++) {
          if (scores[i] > topScore) {
            topScore = scores[i];
            topClass = labels[i];
          }
        }

        // しきい値を超えた場合のみ判定
        if (topScore >= thresholdRatio) {
          if (topClass === sustainedCandidateClass) {
            sustainedHitCount++;
          } else {
            sustainedCandidateClass = topClass;
            sustainedHitCount = 1;
          }

          if (sustainedHitCount >= REQUIRED_SUSTAINED_HITS) {
            let targetTheme = currentThemeKey;
            if (topClass.includes('低音')) targetTheme = 'meditation';
            else if (topClass.includes('中音')) targetTheme = 'piano';
            else if (topClass.includes('高音')) targetTheme = 'zen';
            else{
              targetTheme = 'mute';
            }

            if (currentThemeKey !== targetTheme) {
              crossfadeToTheme(targetTheme);
            }
          }
        } else {
          // 静かな時（しきい値未満）はカウントをリセットするが、音楽は止めずに今のテーマを維持する
          sustainedCandidateClass = null;
          sustainedHitCount = 0;
        }
      }, { probabilityThreshold: 0.05, overlapFactor: 0.50 });
    }

    isListening = true;
    updateBtnUI(true);
  } catch (err) {
    alert('マイクのアクセスが許可されていません。');
  }
}

function stopListening() {
  if (recognizer && recognizer.isListening()) recognizer.stopListening();
  stopVisualizer();
  crossfadeToTheme('mute');
  sustainedCandidateClass = null;
  sustainedHitCount = 0;
  isListening = false;
  updateBtnUI(false);
}

function updateBtnUI(active) {
  const btn = document.getElementById('toggleListenBtn');
  const icon = document.getElementById('listenBtnIcon');
  const text = document.getElementById('listenBtnText');

  if (active) {
    btn.className = 'w-full py-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium shadow-sm border border-rose-200 active:scale-95 transition-all flex items-center justify-center gap-2 mb-8';
    icon.className = 'ph-fill ph-stop text-lg';
    text.textContent = 'ストップ';
  } else {
    btn.className = 'w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-medium shadow-lg shadow-slate-800/20 active:scale-95 transition-all flex items-center justify-center gap-2 mb-8';
    icon.className = 'ph-fill ph-play text-lg';
    text.textContent = 'スタート';
  }
}

/* =========================================================================
   イベントリスナー登録
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  loadAutoModel();
  updateThemeDisplayUI('mute');

  document.getElementById('toggleListenBtn').addEventListener('click', () => {
    if (!isListening) startListening();
    else stopListening();
  });

  // 設定アコーディオンの開閉
  const settingsBtn = document.getElementById('settingsToggleBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsIcon = document.getElementById('settingsToggleIcon');
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    settingsIcon.classList.toggle('rotate-180');
  });

  // スライダー類
  document.getElementById('thresholdSlider').addEventListener('input', (e) => {
    thresholdRatio = e.target.value / 100;
    document.getElementById('thresholdValText').textContent = `${e.target.value}%`;
  });
  document.getElementById('masterVolumeSlider').addEventListener('input', (e) => {
    masterVolumeRatio = e.target.value / 100;
    document.getElementById('masterVolumeValText').textContent = `${e.target.value}%`;
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setValueAtTime(masterVolumeRatio, audioCtx.currentTime);
    }
  });

  // 「？」ボタンのポップアップ開閉
  const helpBtn = document.getElementById('sensitivityHelpBtn');
  const tooltip = document.getElementById('sensitivityTooltip');

  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 親要素へのクリック伝播を防ぐ
    tooltip.classList.toggle('hidden');
  });

  // 画面のどこかをタップしたら説明を閉じる
  document.addEventListener('click', (e) => {
    if (!tooltip.contains(e.target) && e.target !== helpBtn) {
      tooltip.classList.add('hidden');
    }
  });
});