/* 兩台裝置隨機同步壓力測試:兩個 app 各自有自己的本機儲存,共用一個假雲端,雲端推送到各台有隨機延遲
   (兩台會同時改到東西)。兩台隨機新增/刪除/修改記帳、資產、動用底下的還款(巢狀清單),最後等同步安靜下來,檢查:兩台跟雲端一致、
   新增的每一筆都還在(沒被對方蓋掉)、刪掉的每一筆都沒有被救回來、改過的金額是最後一次改的值之一。
   用法:node tests/twodevice.js [種子數] */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
const document = { activeElement: null, getElementById: id => store[id] || (store[id] = el(id)),
  querySelectorAll: () => [], querySelector: () => null, addEventListener(){} };
const mkLS = () => ({ _d:{}, get length(){ return Object.keys(this._d).length; },
  key(i){ const k = Object.keys(this._d); return i < k.length ? k[i] : null; },
  getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; } });
const fetch = async () => { throw new Error('offline'); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const src = require('fs').readFileSync(__dirname + '/../finance_app_artifact.html', 'utf8');
const js = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0]
  .replace(/\ninit\(\);\s*$/, '\n');

async function runSeed(SEED){
  let seed = SEED; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // ---- 假雲端:寫入後,隨機延遲再推給每一台(包括寫的那台自己,Firestore 也會回音) ----
  let doc;
  const listeners = [];
  const DBG = process.env.DBG === String(SEED);
  const log = (...a) => { if (DBG) console.log(((Date.now() - T0) + '').padStart(5), ...a); };
  const T0 = Date.now();
  const mkDb = (who) => ({
    doc: (path) => ({
      async get(){ return { exists: path === 'state/finance' && doc !== undefined, data: () => JSON.parse(JSON.stringify(doc)) }; },
      async set(d){ if (path !== 'state/finance') return; doc = JSON.parse(JSON.stringify(d)); log(who, 'push', d.transactions.map(t => t.id.split('_').pop()).join(','));
        const snap = JSON.parse(JSON.stringify(doc));
        // 每一台照寫入順序收到(Firestore 對同一個監聽者不會把舊的排在新的後面),各台之間的延遲不一樣
        listeners.forEach(l => { const at = Math.max(l.next, Date.now() + Math.floor(rnd() * 300)); l.next = at;
          setTimeout(() => { log(l.who, '<- recv', snap.transactions.map(t => t.id.split('_').pop()).join(',')); l.cb({ exists: true, data: () => JSON.parse(JSON.stringify(snap)) }); }, at - Date.now()); }); },
      async delete(){},
      // 真的 Firestore 訂閱時會先送一次目前那版(啟動時 cloud.get() 已經拿過同一版)
      onSnapshot(cb){ if (path === 'state/finance'){ listeners.push({ cb, next: 0, who });
        if (doc !== undefined){ const snap = JSON.parse(JSON.stringify(doc)); setTimeout(() => cb({ exists: true, data: () => JSON.parse(JSON.stringify(snap)) }), 0); } }
        return () => {}; }
    }),
    collection: () => ({ async get(){ return { docs: [] }; } })
  });
  const boot = (who) => {
    const window = { claude: { use: async n => (n === 'db' ? mkDb(who) : null) } };
    const f = new Function('localStorage', 'window', 'document', 'fetch',
      js + '; return { init, scheduleSave, get state(){ return state; }, set state(v){ state = v; } };');
    return f(mkLS(), window, document, fetch);
  };
  doc = { version: 2, assets: [], liabilities: [], trades: [], budgets: [], netWorthHistory: [], instruments: [],
          transactions: [{ id: 'seed0', date: '2026-09-01', cat: '其他', desc: '起點', amount: -1 }],
          leverage: { creditLimit: 5000000, draws: [{ id: 'dr1', label: 'x', amount: 10000000, useDate: '2026-01-05', note: '', repayments: [] }] } };
  const dev = [boot('A'), boot('B')];
  dev.forEach(d => d.init());
  await wait(200);

  const added = new Set(['seed0']), deleted = new Set();
  const amounts = {};   // id → 每次改過的金額
  let n = 0;
  for (let step = 0; step < 80; step++){
    const di = Math.floor(rnd() * 2), d = dev[di];
    // 三種清單輪流動:記帳(頂層)、資產(頂層)、第一筆動用底下的還款(巢狀)
    const which = rnd();
    const holder = which < 0.6 ? { get: () => d.state.transactions, set: v => { d.state.transactions = v; } }
      : which < 0.8 ? { get: () => d.state.assets, set: v => { d.state.assets = v; } }
      : { get: () => d.state.leverage.draws[0].repayments, set: v => { d.state.leverage.draws[0].repayments = v; } };
    const txs = holder.get();
    const r = rnd();
    if (r < 0.45 || !txs.length){
      const id = `tx${SEED}_${n++}`;
      const amt = Math.ceil(rnd() * 1000);
      txs.push(which < 0.6 ? { id, date: '2026-09-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0'), cat: '餐飲', desc: '', amount: -amt }
        : which < 0.8 ? { id, name: 'a' + id, amount: amt } : { id, date: '2026-09-10', amount: amt });
      added.add(id);
      amounts[id] = [txs[txs.length - 1].amount];
    }else if (r < 0.7){
      const t = txs[Math.floor(rnd() * txs.length)];
      holder.set(txs.filter(x => x.id !== t.id));
      deleted.add(t.id);
    }else{
      const t = txs[Math.floor(rnd() * txs.length)];
      t.amount = (t.amount < 0 ? -1 : 1) * Math.ceil(rnd() * 5000);
      (amounts[t.id] = amounts[t.id] || []).push(t.amount);
    }
    log('AB'[di], 'op', r < 0.45 || !txs.length ? 'add' : r < 0.7 ? 'del' : 'edit', d.state.transactions.map(t => t.id.split('_').pop()).join(','));
    d.scheduleSave();
    await wait(Math.floor(rnd() * 250));
  }
  await wait(3000);   // 存檔延遲 400ms + 推送延遲最多 300ms,來回幾輪
  const all = s => [...s.transactions, ...s.assets, ...((s.leverage && s.leverage.draws[0] && s.leverage.draws[0].repayments) || [])];
  const ids = s => all(s).map(t => t.id).sort().join(',');
  const probs = [];
  const [a, b] = dev.map(x => x.state);
  if (ids(a) !== ids(b)) probs.push(`兩台最後不一致:A 有 ${all(a).length} 筆、B 有 ${all(b).length} 筆`);
  if (ids(a) !== ids(doc)) probs.push('裝置跟雲端最後不一致');
  const have = new Set(all(a).map(t => t.id));
  const lost = [...added].filter(id => !deleted.has(id) && !have.has(id));
  const back = [...deleted].filter(id => have.has(id));
  if (lost.length) probs.push(`新增的 ${lost.length} 筆不見了(被另一台蓋掉):${lost.slice(0, 3).join(',')}`);
  if (back.length) probs.push(`刪掉的 ${back.length} 筆又回來了:${back.slice(0, 3).join(',')}`);
  all(a).forEach(t => { if (amounts[t.id] && !amounts[t.id].includes(t.amount)) probs.push(`${t.id} 的金額 ${t.amount} 不是任何一次改過的值`); });
  console.log(`種子 ${SEED}:最後 ${all(a).length} 筆(新增 ${added.size}、刪除 ${deleted.size})` + (probs.length ? ' ✗' : ' ✓'));
  return probs.map(p => `種子 ${SEED}:${p}`);
}

(async () => {
  const count = Number(process.argv[2]) || 6, from = Number(process.argv[3]) || 1;   // node twodevice.js 組數 [從第幾組開始]
  const bugs = [];
  for (let s = from; s < from + count; s++) bugs.push(...await runSeed(s * 7919));
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
  process.exit(bugs.length ? 1 : 0);
})();
