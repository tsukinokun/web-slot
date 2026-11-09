// プレイヤーごとの台の状態をファイルに保存する（サーバーを再起動してもボーナスが消えない）
import fs from 'node:fs';
import path from 'node:path';
import { newState } from './engine.js';

const DIR = process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'data');
const FILE = path.join(DIR, 'state.json');
fs.mkdirSync(DIR, { recursive: true });
const all = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

export function getState(userId) {
  return (all[userId] ??= newState());
}
export function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all));
  fs.renameSync(tmp, FILE);
}
export function allStates() { return all; }
