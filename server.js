import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { bankRequest } from './src/bank-api.js';
import { SPEC, MAX_PAY, publicInfo } from './src/spec.js';
import { spin } from './src/engine.js';
import { getState, save, allStates } from './src/store.js';

const app = express();
app.use(express.json({ limit: '8kb' }));
app.use(express.static('public'));

const logins = new Map(); // cookie => { playerToken, user }（メモリ上のみ）
const busy = new Set();   // 回転処理中のプレイヤー（連打で二重に回さない）
const rng = () => crypto.randomInt(0, 2 ** 47) / 2 ** 47;
const handleError = (res, err) => { if (!err.status) console.error(err); return res.status(err.status || 500).json({ error: err.status ? err.message : 'サーバー内部エラー' }); };
const getCookie = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);

function requireLogin(req, res, next) {
  const session = logins.get(getCookie(req, 'arcade_session'));
  if (!session) return res.status(401).json({ error: 'ログインしてください' });
  req.login = session; next();
}

// ブラウザに見せてよい状態だけを返す（次ゲーム告知で待っているボーナスは隠す）
function view(st) {
  const hidden = Boolean(st.pendingLamp);
  return {
    lockedRate: hidden ? null : st.lockedRate,
    bonus: hidden || !st.bonus ? null : { ...st.bonus, chain: st.chain },
    lampOn: Boolean(st.bonus && !hidden && st.bonus.game === 0),
    stats: hidden ? { ...st.stats, big: st.stats.big - (st.bonus.type === 'big'), reg: st.stats.reg - (st.bonus.type === 'reg') } : st.stats,
    pendingPayouts: st.pending.length,
  };
}

app.get('/api/info', (_req, res) => res.json(publicInfo()));

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'IDとパスワードを入力してください' });
  try {
    const data = await bankRequest('/api/login', { method: 'POST', body: { username, password } });
    const sid = crypto.randomBytes(32).toString('hex');
    logins.set(sid, { playerToken: data.token, user: data.user });
    res.setHeader('Set-Cookie', `arcade_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
    res.json({ user: data.user });
  } catch (err) { handleError(res, err); }
});

app.post('/api/logout', requireLogin, async (req, res) => {
  logins.delete(getCookie(req, 'arcade_session'));
  res.setHeader('Set-Cookie', 'arcade_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  try { await bankRequest('/api/logout', { method: 'POST', body: { token: req.login.playerToken } }); } catch {}
  res.json({ ok: true });
});

app.get('/api/me', requireLogin, async (req, res) => {
  try {
    const user = await bankRequest('/api/verify', { method: 'POST', body: { token: req.login.playerToken } });
    res.json({ user, state: view(getState(user.id)) });
  } catch (err) { handleError(res, err); }
});

app.get('/api/balance', requireLogin, async (req, res) => {
  try { res.json(await bankRequest(`/api/balance/${req.login.user.id}`, { playerToken: req.login.playerToken })); }
  catch (err) { handleError(res, err); }
});

// 銀行に届いていない払い出しを送り直す
async function flushPayouts(st, playerToken) {
  while (st.pending.length) {
    const p = st.pending[0];
    await bankRequest('/api/payout', { method: 'POST', playerToken, body: { playId: p.playId, payout: p.payout } });
    st.pending.shift(); save();
  }
}

app.post('/api/spin', requireLogin, async (req, res) => {
  const { id: userId } = req.login.user, { playerToken } = req.login;
  if (busy.has(userId)) return res.status(409).json({ error: '処理中です' });
  busy.add(userId);
  const st = getState(userId);
  try {
    try { await flushPayouts(st, playerToken); }
    catch (err) { throw Object.assign(new Error(`前回の払い出しを銀行に送れません（${err.message}）`), { status: 503 }); }

    // 1枚の値段：ボーナス成立中は固定。前回のベットが送信途中なら同じ内容で送り直す
    let rate = st.inflight?.rate ?? st.lockedRate ?? Number(req.body?.rate);
    if (!Number.isInteger(rate) || rate < SPEC.rateMin || rate > SPEC.rateMax)
      return res.status(400).json({ error: `1枚の値段は${SPEC.rateMin}〜${SPEC.rateMax}Gです` });
    st.inflight ??= { requestId: crypto.randomUUID(), rate };
    save();

    let play;
    try {
      play = await bankRequest('/api/bet', { method: 'POST', playerToken, body: {
        playerId: userId, bet: SPEC.bet * rate, maxPayout: MAX_PAY * rate, requestId: st.inflight.requestId } });
    } catch (err) {
      if (err.status !== 503) { st.inflight = null; save(); } // 届いたか分からないときだけ再送用に残す
      throw err;
    }
    st.inflight = null;
    const result = spin(st, rate, rng);
    const payout = result.pay * rate;
    st.stats.betG += SPEC.bet * rate; st.stats.payG += payout;
    st.pending.push({ playId: play.playId, payout });
    save();

    let warning = null;
    try { await flushPayouts(st, playerToken); }
    catch { warning = '払い出しを銀行に送れませんでした。次の回転で自動的に送り直します'; }
    res.json({ ...result, bet: SPEC.bet * rate, payout, warning, state: view(st) });
  } catch (err) { handleError(res, err); }
  finally { busy.delete(userId); }
});

// 店長用：台全体の成績（お店のPCからだけ見られる）
app.get('/api/shop', (req, res) => {
  const ip = req.socket.remoteAddress || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return res.status(403).json({ error: 'お店のPCからだけ見られます' });
  const t = { players: 0, spins: 0, big: 0, reg: 0, betG: 0, payG: 0 };
  for (const st of Object.values(allStates())) {
    t.players++; for (const k of ['spins', 'big', 'reg', 'betG', 'payG']) t[k] += st.stats[k];
  }
  res.json({ ...t, profitG: t.betG - t.payG });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => console.log(`てぃだパラダイス: http://localhost:${port}`));
