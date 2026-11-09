// 台のスペック（ここを変えたら `npm run sim` で機械割を必ず確認する）
// お客さんに公開するのは BIG/REG の確率と継続率だけ。小役の確率と機械割は非公開。
export const SPEC = {
  bet: 3,                         // 1回転のベット枚数（固定）
  rateMin: 10, rateMax: 33,       // 1枚の値段（G）。銀行のベット上限100G ÷ 3枚 = 33
  smalls: [                       // 通常時の小役（確率は 1/odds）
    { role: 'replay', odds: 7.3, pay: 3 },   // 実質再遊技（3枚払い出しとして精算）
    { role: 'grape',  odds: 8.1, pay: 8 },
    { role: 'cherry', odds: 36,  pay: 2 },
  ],
  big: { odds: 297, games: 21, payPerGame: 13 }, // 1G: 3枚入れて13枚（純増10枚）
  reg: { odds: 455, games: 8,  payPerGame: 13 },
  continueRate: 0.20,             // ボーナス終了ごとの継続抽選
  continueBigShare: 0.5,          // 継続したときに BIG になる割合
};
export const MAX_PAY = Math.max(SPEC.big.payPerGame, SPEC.reg.payPerGame, ...SPEC.smalls.map(s => s.pay));

// お客さんに見せる情報
export function publicInfo() {
  const b = 1 / SPEC.big.odds, r = 1 / SPEC.reg.odds;
  return {
    big: SPEC.big.odds, reg: SPEC.reg.odds,
    combined: Math.round(10 / (b + r)) / 10,
    continueRate: Math.round(SPEC.continueRate * 100),
    bigGames: SPEC.big.games, regGames: SPEC.reg.games,
    rateMin: SPEC.rateMin, rateMax: SPEC.rateMax, bet: SPEC.bet,
  };
}
