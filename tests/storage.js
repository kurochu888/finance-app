/* 瀏覽器空間(localStorage 約 5MB)快滿時:主資料一定要存得進去,先清可以重抓的回測快取、再刪最舊的備份;
   主資料大到放不下一份備份時要提醒(不然備份被刪光、總用量反而掉下來,原本的「快滿了」提醒會消失)。 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {}; global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)), querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined }; global.fetch = async () => { throw new Error('offline'); };
const QUOTA = 5 * 1024 * 1024;
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;}, key(i){return Object.keys(this._d)[i] ?? null;},
  getItem(k){return this._d[k] ?? null;}, removeItem(k){ delete this._d[k]; },
  used(){ return Object.entries(this._d).reduce((a, [k, v]) => a + (k.length + v.length) * 2, 0); },
  setItem(k, v){ v = String(v); const old = this._d[k]; const next = this.used() - (old ? (k.length + old.length) * 2 : 0) + (k.length + v.length) * 2;
    if (next > QUOTA){ const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } this._d[k] = v; } };
localStorage.setItem('financeTwseCooldownUntil', String(Date.now() + 1e12));
const src = require('fs').readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs.replace(/\ninit\(\);\s*$/, '\n') + `;globalThis.A = { get state(){return state}, set state(v){state=v}, sampleData, writeLocal, renderOverview,
  set bt(v){ backtestFullHistory = v; }, saveBacktestHistoryCache, set storageMode(v){ storageMode = v; } };`);

const bugs = [];
const must = (c, m) => { if (!c) bugs.push(m); };
const bigState = n => { const s = A.sampleData(); s.transactions = Array.from({ length: n }, (_, i) => ({ id:'tx' + i, date:'2026-01-01', cat:'餐飲', desc:'測試一二三四五六七八九十', amount:-100 - i })); return s; };

console.log('空間不夠時先清回測快取,備份留著');
{
  const h = []; for (let i = 0; i < 2600; i++) h.push({ d: '2016-01-' + String(i).padStart(4, '0'), c: 12.3456 + i });
  A.bt = { '00631L': h, '00675L': h };
  A.saveBacktestHistoryCache();
  // 備份約 2.27MB + 回測快取約 0.35MB + 主資料約 2.5MB ≈ 5.03MB,超過 5MB;清掉回測快取就放得下
  A.state = bigState(13600);
  localStorage.setItem('financeBackup_2026-09-01', JSON.stringify(A.state));
  A.state = bigState(15000);
  const ok = A.writeLocal(JSON.parse(JSON.stringify(A.state)));
  const keys = Object.keys(localStorage._d);
  must(ok, '主資料應該存得進去');
  must(localStorage.used() > 4.5 * 1024 * 1024, '(測試本身)這組資料要大到真的觸發空間不夠,否則測不到東西');
  must(!keys.includes('financeBacktestHistory_v2'), '空間不夠時應該先清掉回測快取');
  must(keys.includes('financeBackup_2026-09-01'), '清回測快取就夠的話,備份不該被刪');
}
console.log('  ok');

console.log('主資料大到放不下一份備份時,資料卡要提醒(就算總用量不到 75%)');
{
  A.storageMode = 'local';
  for (const k of Object.keys(localStorage._d)) if (k.startsWith('financeBackup_')) localStorage.removeItem(k);
  A.state = bigState(17000);
  must(A.writeLocal(JSON.parse(JSON.stringify(A.state))), '主資料應該存得進去');
  const html = A.renderOverview();
  must(html.includes('放不下自動備份'), '主資料超過空間一半時應該提醒放不下備份');
  A.state = bigState(100);
  A.writeLocal(JSON.parse(JSON.stringify(A.state)));
  must(!A.renderOverview().includes('放不下自動備份'), '資料小的時候不該跳這個提醒');
}
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);
