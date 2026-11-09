// 機械割シミュレーター（本番と同じ src/engine.js を回す）
// 使い方: npm run sim    （回転数を変えるなら: node tools/sim.mjs 5000000）
import { SPEC } from '../src/spec.js';
import { newState, spin } from '../src/engine.js';

// 理論値（期待値の計算）
function theory() {
  const smallOut = SPEC.smalls.reduce((a, r) => a + r.pay / r.odds, 0);
  const pB = 1 / SPEC.big.odds, pR = 1 / SPEC.reg.odds, q = pB + pR;
  const io = b => ({ in: b.games * SPEC.bet, out: b.games * b.payPerGame });
  const B = io(SPEC.big), R = io(SPEC.reg);
  const mix = (w, k) => w * B[k] + (1 - w) * R[k];
  const extra = SPEC.continueRate / (1 - SPEC.continueRate);
  const cycIn = SPEC.bet / q + mix(pB / q, 'in') + extra * mix(SPEC.continueBigShare, 'in');
  const cycOut = smallOut / q + mix(pB / q, 'out') + extra * mix(SPEC.continueBigShare, 'out');
  return cycOut / cycIn;
}

const total = Number(process.argv[2] || 3_000_000);
const st = newState();
let inM = 0, outM = 0;
for (let i = 0; i < total; i++) { const r = spin(st, 10, Math.random); inM += SPEC.bet; outM += r.pay; }
console.log(`機械割 理論値 ${(theory() * 100).toFixed(2)}%  / 実機エンジン ${total.toLocaleString()}回転 ${(outM / inM * 100).toFixed(2)}%`);

// 授業1日（2,100回転・1枚10G）のお店の収支
const days = 20000, res = [];
for (let d = 0; d < days; d++) {
  const s = newState(); let net = 0;
  for (let i = 0; i < 2100; i++) net += (SPEC.bet - spin(s, 10, Math.random).pay) * 10;
  res.push(net);
}
res.sort((a, b) => a - b);
const avg = res.reduce((a, b) => a + b, 0) / days;
console.log(`2,100回転・1枚10G: お店の平均収支 ${avg.toFixed(0)}G / 赤字の確率 ${(res.filter(x => x < 0).length / days * 100).toFixed(1)}% / 下位5% ${res[Math.floor(days * 0.05)]}G / 上位5% ${res[Math.floor(days * 0.95)]}G`);
