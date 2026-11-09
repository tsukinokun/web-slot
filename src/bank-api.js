// 銀行サーバーとの通信（GAME_KEY はサーバーだけが持ち、ブラウザには渡さない）
const base = process.env.BANK_URL;
const key = process.env.GAME_KEY;
if (!base || !key) throw new Error('BANK_URL と GAME_KEY を .env に設定してください');

export async function bankRequest(path, { method = 'GET', body, playerToken } = {}) {
  let response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'x-game-key': key, ...(playerToken ? { 'x-player-token': playerToken } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw Object.assign(new Error('銀行サーバーに接続できません'), { status: 503 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '銀行APIエラー'), { status: response.status });
  return data;
}
