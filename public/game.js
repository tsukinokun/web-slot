// てぃだパラダイス：画面と演出（抽選はすべてサーバーが行う。ここは結果を見せるだけ）
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ================= 音（ファイルを使わずに合成する） =================
const Sound = (() => {
  let ctx = null, bgmTimer = null;
  const enabled = () => $('sound').checked;
  function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function tone(freq, dur, { type = 'square', vol = 0.08, at = 0, to = null } = {}) {
    if (!enabled()) return;
    const c = ac(), t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.1, at = 0 } = {}) {
    if (!enabled()) return;
    const c = ac(), len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = vol;
    s.connect(g).connect(c.destination); s.start(c.currentTime + at);
  }
  // 琉球音階（ド・ミ・ファ・ソ・シ）
  const RYUKYU = [523, 659, 698, 784, 988, 1047, 1319, 1397, 1568];
  return {
    unlock: () => { try { ac(); } catch {} },
    lever: () => { noise(0.05, { vol: 0.2 }); tone(140, 0.08, { type: 'triangle', vol: 0.2 }); },
    stop: i => tone([392, 440, 494][i], 0.08, { type: 'triangle', vol: 0.25 }),
    lamp: () => { tone(700, 0.45, { type: 'sawtooth', vol: 0.07, to: 2400 }); [1568, 2093, 2637].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.12, at: 0.35 + i * 0.07 })); },
    rainbow: () => { for (let i = 0; i < 12; i++) tone(RYUKYU[i % RYUKYU.length] * 2, 0.25, { type: 'sine', vol: 0.1, at: i * 0.06 }); tone(500, 1.2, { type: 'sawtooth', vol: 0.06, to: 3000 }); },
    hint: () => { tone(2600, 0.12, { type: 'sine', vol: 0.15 }); tone(3200, 0.2, { type: 'sine', vol: 0.12, at: 0.1 }); },
    freeze: () => { tone(80, 2.2, { type: 'sawtooth', vol: 0.12, to: 40 }); },
    coin: n => { for (let i = 0; i < Math.min(n, 15); i++) tone(1800 + (i % 3) * 200, 0.05, { type: 'square', vol: 0.05, at: i * 0.045 }); },
    reach: () => { tone(880, 0.15, { vol: 0.08 }); tone(1175, 0.25, { vol: 0.08, at: 0.12 }); },
    fanfare: type => {
      const big = [523, 659, 784, 1047, 784, 1047, 1319, 1568], reg = [659, 784, 988, 1319];
      (type === 'big' ? big : reg).forEach((f, i) => { tone(f, 0.22, { type: 'square', vol: 0.09, at: i * 0.13 }); tone(f / 2, 0.22, { type: 'triangle', vol: 0.12, at: i * 0.13 }); });
    },
    drumroll: sec => { for (let t = 0, gap = 0.12; t < sec; t += gap, gap = Math.max(0.035, gap * 0.93)) noise(0.04, { vol: 0.15, at: t }); },
    win: () => { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.6, { type: 'square', vol: 0.07, at: i * 0.07 })); noise(0.5, { vol: 0.2, at: 0.5 }); },
    lose: () => { [523, 440, 349].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.15, at: i * 0.25 })); },
    bgm: type => {
      Sound.bgmStop(); if (!enabled()) return;
      const melody = type === 'big' ? [0, 1, 3, 4, 5, 4, 3, 1, 2, 3, 1, 0, 1, 3, 4, 8] : [5, 4, 3, 1, 3, 4, 5, 7];
      let step = 0;
      bgmTimer = setInterval(() => {
        const n = melody[step % melody.length];
        tone(RYUKYU[n], 0.16, { type: 'square', vol: 0.035 });
        if (step % 2 === 0) tone(RYUKYU[n] / 4, 0.18, { type: 'triangle', vol: 0.08 });
        if (step % 4 === 0) noise(0.03, { vol: 0.06 });
        step++;
      }, type === 'big' ? 170 : 210);
    },
    bgmStop: () => { clearInterval(bgmTimer); bgmTimer = null; },
  };
})();

// ================= リール =================
const SYMBOL_HTML = {
  seven: '<span class="sym-seven">7</span>', bar: '<span class="sym-bar">BAR</span>',
  pine: '🍍', grape: '🍇', cherry: '🍒', hibi: '🌺', shell: '🐚',
};
// 各リールは7種類の図柄を3回ずつ並べた21コマ（どの図柄も最大6コマで止められる）
const ORDERS = [
  ['seven', 'grape', 'pine', 'cherry', 'bar', 'hibi', 'shell'],
  ['seven', 'pine', 'cherry', 'grape', 'shell', 'bar', 'hibi'],
  ['seven', 'shell', 'grape', 'hibi', 'pine', 'bar', 'cherry'],
];
const STRIPS = ORDERS.map(o => [...o, ...o, ...o]);
const N = 21, SPEED = 22; // コマ/秒

class Reel {
  constructor(i) {
    this.i = i; this.strip = STRIPS[i]; this.el = $(`strip${i}`);
    this.el.innerHTML = [...this.strip, ...this.strip, ...this.strip].map(s => `<div class="cell">${SYMBOL_HTML[s]}</div>`).join('');
    this.pos = Math.floor(Math.random() * N); // 中段に来ているコマ番号（小数あり）
    this.spinning = false; this.render();
  }
  render() {
    const cell = this.el.firstElementChild.getBoundingClientRect().height || 84;
    const top = ((this.pos - 1) % N + N) % N + N; // 上段のコマ（真ん中の束を使う）
    this.el.style.transform = `translateY(${-top * cell}px)`;
  }
  start() { this.spinning = true; this.stopping = null; }
  tick(dt) {
    if (!this.spinning) return;
    if (this.stopping) {
      const s = this.stopping; s.t += dt;
      const k = Math.min(1, s.t / s.dur), ease = 1 - Math.pow(1 - k, 3);
      this.pos = s.from - (s.from - s.to) * ease;
      if (k >= 1) { this.pos = ((s.to % N) + N) % N; this.spinning = false; this.stopping = null; s.done(); }
    } else this.pos -= SPEED * dt; // 図柄は上から下へ流れる
    this.render();
  }
  // 中段に target が来るところまですべらせて止める
  stop(target) {
    return new Promise(done => {
      let p = Math.floor(this.pos);
      while (this.strip[((p % N) + N) % N] !== target) p--;
      const dist = this.pos - p;
      this.stopping = { from: this.pos, to: p, t: 0, dur: 0.09 + dist / SPEED * 0.9, done };
    });
  }
}
const reels = [0, 1, 2].map(i => new Reel(i));
let last = performance.now();
(function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; reels.forEach(r => r.tick(dt)); requestAnimationFrame(loop); })(last);
addEventListener('resize', () => reels.forEach(r => r.render()));

// ================= 画面 =================
let info = null, state = null, phase = 'idle', current = null, stopped = [], stopQueue = Promise.resolve();
const fmt = n => Number(n).toLocaleString();

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(data.error || '通信に失敗しました'), { status: res.status });
  return data;
}
function message(html) { $('message').innerHTML = html; }
function setLamp(color) { $('lamp').className = 'lamp' + (color === 'rainbow' ? ' rainbow' : color ? ' on' : ''); }
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function petals(n = 30) {
  const box = $('petals');
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = ['🌺', '🌸', '✨', '🌴'][i % 4];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = 2.5 + Math.random() * 3 + 's';
    s.style.animationDelay = Math.random() * 1.5 + 's';
    box.appendChild(s); setTimeout(() => s.remove(), 7000);
  }
}
async function overlay(html, ms) { $('overlayInner').innerHTML = html; $('overlay').hidden = false; await sleep(ms); }
function closeOverlay() { $('overlay').hidden = true; }

function rate() { return Number($('rate').value); }
function showRate() {
  const locked = state?.lockedRate;
  if (locked) $('rate').value = locked;
  $('rateView').textContent = rate(); $('spinCost').textContent = rate() * 3;
  $('rate').disabled = Boolean(locked);
  document.querySelectorAll('[data-rate]').forEach(b => b.disabled = Boolean(locked));
  $('rateLock').hidden = !locked;
  if (!phaseBusy()) $('betView').textContent = rate() * 3;
}
const phaseBusy = () => phase !== 'idle';

function showBonusBar() {
  const b = state?.bonus;
  if (!b || b.game === 0) { $('bonusBar').hidden = true; return; }
  $('bonusBar').hidden = false;
  $('bonusBar').className = 'bonus-bar ' + b.type;
  $('bonusBar').textContent = `${b.type.toUpperCase()} ${b.game}/${b.total}G　獲得 ${b.got}枚${b.chain > 1 ? `　${b.chain}連チャン中` : ''}`;
}
function setMode(type) {
  if (type) document.body.dataset.mode = type; else delete document.body.dataset.mode;
}

function showStats() {
  const s = state.stats;
  $('since').textContent = s.since; $('spins').textContent = fmt(s.spins);
  $('bigCount').textContent = s.big; $('regCount').textContent = s.reg;
  $('combined').textContent = s.big + s.reg ? '1/' + Math.round((s.normal || 0) / (s.big + s.reg)) : '-';
  $('history').innerHTML = s.history.map(h =>
    `<li><span class="t-${h.type}">${h.type.toUpperCase()}</span><span>${h.since}G${h.chain > 1 ? `（${h.chain}連）` : ''}</span><span>${h.got}枚</span></li>`).join('');
  const net = s.payG - s.betG;
  $('sessionNet').textContent = `この台での収支 ${net >= 0 ? '+' : ''}${fmt(net)}G`;
  showBonusBar(); showRate();
}
async function loadBalance() {
  try { const u = await api('/api/balance'); $('balance').textContent = `残高 ${fmt(u.balance)}G` + (u.debt ? `（借金 ${fmt(u.debt)}G）` : ''); }
  catch (err) { $('balance').textContent = err.message; if (err.status === 401) showLogin(); }
}

function updateButtons() {
  $('lever').disabled = phase !== 'idle';
  document.querySelectorAll('.stop').forEach((b, i) => {
    const can = phase === 'spinning' && !stopped[i];
    b.disabled = !can; b.classList.toggle('ready', can);
  });
}

// ================= 1回転の流れ =================
async function lever() {
  if (phase !== 'idle') return;
  Sound.unlock();
  phase = 'requesting'; updateButtons();
  Sound.lever();
  $('reelsFrame').classList.remove('win');
  $('payView').textContent = 0;
  let res;
  try { res = await api('/api/spin', { method: 'POST', body: JSON.stringify({ rate: rate() }) }); }
  catch (err) { message(err.message); phase = 'idle'; updateButtons(); if (err.status === 401) showLogin(); return; }
  current = res; stopped = [false, false, false];
  $('betView').textContent = res.bet;
  message(res.bonus ? `${res.bonus.type.toUpperCase()} ${res.bonus.game}/${res.bonus.total}G` : '&nbsp;');

  // レバーONの演出：フリーズ → 先告知 → 予兆
  if (res.lamp?.freeze) {
    $('freeze').hidden = false; Sound.freeze(); message('……');
    await sleep(2400);
    $('freeze').hidden = true;
  }
  if (res.lamp?.timing === 'lever') {
    setLamp(res.lamp.color);
    res.lamp.color === 'rainbow' ? Sound.rainbow() : Sound.lamp();
    shake($('lamp'));
    if (!res.fanfare) message(res.lamp.next ? '次ゲーム告知！' : 'ボーナス確定！');
  }
  if (res.hint) { Sound.hint(); $('reelsFrame').classList.add('flash'); setTimeout(() => $('reelsFrame').classList.remove('flash'), 700); }

  reels.forEach(r => r.start());
  phase = 'spinning'; updateButtons();
  if ($('autoStop').checked) {
    await sleep(450); for (let i = 0; i < 3; i++) { await stopReel(i); await sleep(180); }
  }
}

function stopReel(i) {
  if (phase !== 'spinning' || stopped[i]) return stopQueue;
  stopped[i] = true; updateButtons();
  stopQueue = stopQueue.then(async () => {
    await reels[i].stop(current.symbols[i]);
    Sound.stop(i);
    // 7-7 のリーチ
    const shown = current.symbols.filter((_, k) => stopped[k] && !reels[k].spinning);
    if (shown.length === 2 && shown.every(s => s === 'seven')) Sound.reach();
    if (stopped.every(Boolean) && reels.every(r => !r.spinning)) await finish();
  });
  return stopQueue;
}
function nextStop() { const i = stopped.findIndex(s => !s); if (i >= 0) stopReel(i); }

async function finish() {
  phase = 'result'; updateButtons();
  const res = current;
  // 後告知（第3停止）
  if (res.lamp?.timing === 'stop3') {
    await sleep(250);
    setLamp(res.lamp.color); res.lamp.color === 'rainbow' ? Sound.rainbow() : Sound.lamp(); shake($('lamp'));
    message('ボーナス確定！'); petals(12);
  }
  // ボーナス開始のファンファーレ
  if (res.fanfare) {
    setLamp(null); setMode(res.fanfare); Sound.fanfare(res.fanfare); petals(40);
    await overlay(`<div class="ov-fanfare ${res.fanfare}">${res.fanfare === 'big' ? 'BIG BONUS!!' : 'REGULAR BONUS!'}</div>`, 1600);
    closeOverlay(); Sound.bgm(res.fanfare);
  }
  if (res.payout > 0) {
    $('reelsFrame').classList.add('win');
    $('payView').textContent = res.pay;
    Sound.coin(res.pay);
    if (!res.bonus) message(`${{ replay: 'リプレイ', grape: 'ブドウ', cherry: 'チェリー' }[res.role] || ''} +${res.pay}枚（${fmt(res.payout)}G）`);
  }
  state = res.state;
  showStats();
  if (res.bonus) message(`${res.bonus.type.toUpperCase()} 残り${res.bonus.left}G　+${fmt(res.payout)}G`);
  if (res.chain) await chainChallenge(res);
  if (res.warning) message(res.warning);
  loadBalance();
  phase = 'idle'; updateButtons();
}

// ボーナス最終ゲームの継続チャレンジ
async function chainChallenge(res) {
  const { continued, level, next, count } = res.chain;
  const gotG = res.bonus.got * res.rate;
  Sound.bgmStop();
  await sleep(400);
  const labels = { 1: 'チャンス', 2: 'チャンスアップ！', 3: '激アツ!!', 4: '継続確定!!!' };
  for (const n of [3, 2, 1]) {
    await overlay(`<div class="lv${level}"><div class="ov-title">てぃだ継続チャレンジ</div><div class="ov-sun"></div><div class="ov-title">${labels[level]}</div><div class="ov-count">${n}</div></div>`, 0);
    Sound.drumroll(0.9); await sleep(900);
  }
  if (continued) {
    Sound.win(); petals(60); setLamp(level === 4 ? 'rainbow' : 'sun');
    await overlay(`<div class="ov-result win">継続!!</div><div class="ov-sub">${count + 1}連チャン目　次は ${next.toUpperCase()}</div>`, 2200);
    message('継続！レバーでボーナス開始');
  } else {
    Sound.lose(); setMode(null);
    await overlay(`<div class="ov-result lose">終了</div><div class="ov-sub">${count}連チャン　獲得 ${res.bonus.got}枚（${fmt(gotG)}G）</div>`, 2000);
    message(`おつかれさま！${count}連チャンで終了`);
  }
  closeOverlay();
}

// ================= ログイン =================
function showGame(user) { $('loginPanel').hidden = true; $('gamePanel').hidden = false; $('welcome').textContent = `${user.name} さん`; }
function showLogin() { Sound.bgmStop(); setMode(null); $('gamePanel').hidden = true; $('loginPanel').hidden = false; }
function restore(s) {
  state = s; showStats();
  if (s.lampOn) { setLamp('sun'); message('ボーナス確定中！レバーでボーナス開始'); }
  if (s.bonus && s.bonus.game > 0) { setMode(s.bonus.type); message('ボーナス中！'); }
}

$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('loginMessage').textContent = '認証中…';
  try {
    const { user } = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    $('password').value = ''; $('loginMessage').textContent = '';
    const me = await api('/api/me'); showGame(user); restore(me.state); loadBalance();
  } catch (err) { $('loginMessage').textContent = err.message; }
};
$('logout').onclick = async () => {
  if (phase !== 'idle') return;
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  showLogin();
};

// ================= 操作 =================
$('lever').onclick = lever;
document.querySelectorAll('.stop').forEach(b => b.onclick = () => stopReel(Number(b.dataset.i)));
$('rate').oninput = showRate;
document.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { $('rate').value = b.dataset.rate; showRate(); });
$('sound').onchange = () => { try { localStorage.setItem('tida-sound', $('sound').checked ? '1' : '0'); } catch {} if (!$('sound').checked) Sound.bgmStop(); else if (state?.bonus?.game > 0) Sound.bgm(state.bonus.type); };
$('autoStop').onchange = () => { try { localStorage.setItem('tida-auto', $('autoStop').checked ? '1' : '0'); } catch {} };
try { $('sound').checked = localStorage.getItem('tida-sound') !== '0'; $('autoStop').checked = localStorage.getItem('tida-auto') === '1'; } catch {}
addEventListener('keydown', e => {
  if ($('gamePanel').hidden || e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); phase === 'idle' ? lever() : nextStop(); }
  const k = { Digit1: 0, Digit2: 1, Digit3: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }[e.code];
  if (k !== undefined) { e.preventDefault(); stopReel(k); }
});

// ================= 起動 =================
api('/api/info').then(i => {
  info = i;
  $('pBig').textContent = `1/${i.big}`; $('pReg').textContent = `1/${i.reg}`;
  $('pAll').textContent = `1/${i.combined}`; $('pCont').textContent = `${i.continueRate}%`;
  $('gBig').textContent = i.bigGames; $('gReg').textContent = i.regGames;
  $('rate').min = i.rateMin; $('rate').max = i.rateMax;
});
api('/api/me').then(me => { showGame(me.user); restore(me.state); loadBalance(); }).catch(() => showLogin());
updateButtons();
