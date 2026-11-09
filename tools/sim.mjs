// 機械割シミュレーター（企画用）
// 使い方: node tools/sim.mjs
// 数値を変えたら、機械割が狙い（94%）に合うか必ず確認する。

export const SPEC = {
  medalYen: 10,           // 1枚 = 何G
  bet: 3,                 // 1回転のベット枚数
  // 通常時の小役（確率は 1/x の x）
  smalls: [
    { name: 'リプレイ', odds: 7.3, pay: 3 },  // 実質再遊技（3枚払い出しとして精算）
    { name: 'ブドウ',   odds: 6.4, pay: 8 },
    { name: 'チェリー', odds: 36,  pay: 2 },
  ],
  // ボーナス初当たり（1/x）
  big: { odds: 297, games: 21, payPerGame: 13 }, // 1G: 3枚入れて13枚 → 純増10枚
  reg: { odds: 455, games: 8,  payPerGame: 13 },
  // ボーナス終了時の継続抽選
  continueRate: 0.20,
  continueBigShare: 0.5,  // 継続したときに BIG になる割合
};

// ---- 理論値（期待値の厳密計算） ----
export function theory(s = SPEC) {
  const smallOut = s.smalls.reduce((a, r) => a + r.pay / r.odds, 0);
  const pB = 1 / s.big.odds, pR = 1 / s.reg.odds, q = pB + pR;
  const bonusIO = b => ({ in: b.games * s.bet, out: b.games * b.payPerGame });
  const B = bonusIO(s.big), R = bonusIO(s.reg);
  const mix = (w, k) => w * B[k] + (1 - w) * R[k];
  // 1サイクル = 通常時(初当たりまで) + ボーナス連チャン
  const normalSpins = 1 / q;
  const extraBonuses = s.continueRate / (1 - s.continueRate);
  const firstBigShare = pB / q;
  const cycIn = normalSpins * s.bet + mix(firstBigShare, 'in') + extraBonuses * mix(s.continueBigShare, 'in');
  const cycOut = normalSpins * smallOut + mix(firstBigShare, 'out') + extraBonuses * mix(s.continueBigShare, 'out');
  return {
    rtp: cycOut / cycIn,
    initialHit: 1 / q,
    avgChain: 1 / (1 - s.continueRate),
    smallOnlyRtp: smallOut / s.bet,
  };
}

// ---- モンテカルロ（遊ぶ人1人・お店の1日） ----
function playSpins(n, s = SPEC, rnd = Math.random) {
  let net = 0; // お店から見た差枚（+ならお店の得）
  let spins = 0, bonusQueue = [];
  while (spins < n) {
    if (bonusQueue.length) {
      const b = bonusQueue.shift();
      const cfg = b === 'BIG' ? s.big : s.reg;
      for (let g = 0; g < cfg.games && spins < n; g++, spins++) net += s.bet - cfg.payPerGame;
      if (rnd() < s.continueRate) bonusQueue.push(rnd() < s.continueBigShare ? 'BIG' : 'REG');
      continue;
    }
    spins++; net += s.bet;
    let r = rnd();
    const pB = 1 / s.big.odds, pR = 1 / s.reg.odds;
    if (r < pB) { bonusQueue.push('BIG'); continue; }
    r -= pB;
    if (r < pR) { bonusQueue.push('REG'); continue; }
    r -= pR;
    for (const sm of s.smalls) { if (r < 1 / sm.odds) { net -= sm.pay; break; } r -= 1 / sm.odds; }
  }
  return net * s.medalYen;
}

function pct(arr, p) { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = theory();
  console.log(`機械割(理論) ${(t.rtp * 100).toFixed(2)}%  / 小役だけ ${(t.smallOnlyRtp * 100).toFixed(1)}%`);
  console.log(`初当たり 1/${t.initialHit.toFixed(1)}  継続率 ${SPEC.continueRate * 100}%  平均連チャン ${t.avgChain.toFixed(2)}回`);
  const N = 20000;
  for (const spins of [100, 300, 1000, 3000]) {
    const res = Array.from({ length: N }, () => playSpins(spins));
    const shopLoss = res.filter(x => x < 0).length / N;
    const avg = res.reduce((a, b) => a + b, 0) / N;
    console.log(`${String(spins).padStart(4)}回転: お店の平均収支 ${avg.toFixed(0).padStart(6)}G  お店が赤字になる確率 ${(shopLoss * 100).toFixed(1).padStart(4)}%  ` +
      `お店の最悪5% ${pct(res, 0.05)}G  最良5% ${pct(res, 0.95)}G`);
  }
}
