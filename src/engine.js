// 抽選と出目を決める（サーバー専用。ブラウザには結果だけを送る）
// rng() は 0以上1未満の乱数を返す関数。本番は crypto、シミュレーターは Math.random。
import { SPEC } from './spec.js';

// 図柄: seven(7) bar(BAR) pine(🍍リプレイ) grape(🍇) cherry(🍒) hibi(🌺ボーナス中の役) shell(🐚ハズレ)
const FILLERS = ['seven', 'bar', 'pine', 'grape', 'hibi', 'shell'];

export function newState() {
  return {
    lockedRate: null,     // ボーナス成立〜連チャン終了まで1枚の値段を固定する
    bonus: null,          // { type, left, total, game, got }
    pendingLamp: null,    // 次ゲーム告知のとき、次のレバーで光らせるランプ
    chain: 0,             // 連チャン数（1 = 初当たり）
    stats: { spins: 0, normal: 0, since: 0, big: 0, reg: 0, betG: 0, payG: 0, history: [] },
    inflight: null,       // 銀行にベットを送信中（タイムアウト時の再送用）
    pending: [],          // 払い出しが銀行に届いていないもの
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function weighted(rng, table) { // [[value, weight], ...]
  let r = rng() * table.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of table) { if ((r -= w) < 0) return v; }
  return table[table.length - 1][0];
}

// ハズレ目：どのラインにも揃わない出目。reach=true なら 7-7 のリーチ目にする
function missSymbols(rng, reach = false) {
  if (reach) return ['seven', 'seven', pick(rng, ['pine', 'grape', 'shell', 'hibi'])];
  for (;;) {
    const s = [pick(rng, FILLERS), pick(rng, [...FILLERS, 'cherry']), pick(rng, [...FILLERS, 'cherry'])];
    if (s[0] === s[1] && s[1] === s[2]) continue;
    if (s[0] === 'seven' && s[1] === 'seven') continue; // リーチ目は演出用にとっておく
    return s;
  }
}

function lotteryNormal(rng) {
  let r = rng();
  for (const [role, cfg] of [['big', SPEC.big], ['reg', SPEC.reg], ...SPEC.smalls.map(s => [s.role, s])]) {
    if ((r -= 1 / cfg.odds) < 0) return role;
  }
  return 'none';
}

function startBonus(state, type) {
  const cfg = SPEC[type];
  state.bonus = { type, left: cfg.games, total: cfg.games, game: 0, got: 0 };
}

// 1回転ぶん進める。state を書き換え、画面に出す結果を返す
export function spin(state, rate, rng) {
  const st = state.stats;
  st.spins++;
  const result = { rate, symbols: null, pay: 0, role: 'none', lamp: null, hint: false, bonus: null, fanfare: null, chain: null };

  if (state.bonus) {
    // ---- ボーナス中 ----
    const b = state.bonus, cfg = SPEC[b.type];
    if (state.pendingLamp) { result.lamp = state.pendingLamp; state.pendingLamp = null; }
    b.game++; b.left--; b.got += cfg.payPerGame;
    result.role = 'bonus';
    result.pay = cfg.payPerGame;
    if (b.game === 1) {
      result.symbols = b.type === 'big' ? ['seven', 'seven', 'seven'] : ['seven', 'seven', 'bar'];
      result.fanfare = b.type;
    } else result.symbols = ['hibi', 'hibi', 'hibi'];
    result.bonus = { type: b.type, game: b.game, total: b.total, left: b.left, got: b.got, chain: state.chain };

    if (b.left === 0) {
      // 継続抽選と、あおり演出の強さ（4 = レインボー = 継続確定）
      const continued = rng() < SPEC.continueRate;
      const level = continued ? weighted(rng, [[1, 10], [2, 25], [3, 45], [4, 20]])
                              : weighted(rng, [[1, 55], [2, 35], [3, 10]]);
      const next = continued ? (rng() < SPEC.continueBigShare ? 'big' : 'reg') : null;
      result.chain = { continued, level, next, count: state.chain };
      state.stats.history.unshift({ type: b.type, since: st.since, chain: state.chain, got: b.got });
      state.stats.history.length = Math.min(state.stats.history.length, 20);
      if (continued) {
        state.chain++;
        st[next]++;
        startBonus(state, next);
      } else {
        state.bonus = null; state.lockedRate = null; state.chain = 0; st.since = 0;
      }
    }
    return result;
  }

  // ---- 通常時 ----
  st.since++; st.normal = (st.normal || 0) + 1;
  const role = lotteryNormal(rng);
  result.role = role;
  if (role === 'big' || role === 'reg') {
    st[role]++;
    state.chain = 1;
    state.lockedRate = rate;
    startBonus(state, role);
    const premium = role === 'big' && rng() < 1 / 12;           // レインボーはBIG確定
    const freeze = premium && rng() < 1 / 3;                    // フリーズはさらにレア
    const timing = freeze ? 'lever' : weighted(rng, [['lever', 25], ['stop3', 50], ['next', 25]]);
    const lamp = { timing: timing === 'next' ? 'lever' : timing, color: premium ? 'rainbow' : 'sun', freeze, next: timing === 'next' };
    if (timing === 'next') { state.pendingLamp = lamp; result.hint = rng() < 0.6; }
    else result.lamp = lamp;
    result.symbols = missSymbols(rng, rng() < 0.35);
    return result;
  }
  const small = SPEC.smalls.find(s => s.role === role);
  if (small) result.pay = small.pay;
  if (role === 'replay') result.symbols = ['pine', 'pine', 'pine'];
  else if (role === 'grape') result.symbols = ['grape', 'grape', 'grape'];
  else if (role === 'cherry') { const m = missSymbols(rng); result.symbols = ['cherry', m[1] === 'cherry' ? 'shell' : m[1], m[2]]; }
  else {
    result.symbols = missSymbols(rng, rng() < 0.03);   // たまにリーチ目（ガセ）
    if (result.symbols[0] === 'cherry') result.symbols[0] = 'shell';
    result.hint = rng() < 1 / 150;                     // ガセの予兆
  }
  return result;
}
