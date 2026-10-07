/* 刪除紀錄(tombstone)的固定情境:兩個 app 各自有本機儲存、共用假雲端,推送由測試手動送達(不靠隨機)。
   1. 剛更新到有刪除紀錄的版本:本機是舊資料(裡面有別台早就刪掉的)、還沒有任何刪除紀錄 → 第一次同步不能救回來
   2. 按了刪除、還在 400ms 存檔延遲裡就收到別台的改動 → 刪掉的不能被補回來
   3. 從舊備份還原:還原回來的要留住,推到另一台也不能被刪除紀錄刪掉
   4. 一台刪、另一台同時改同一筆 → 刪除優先,兩台一致 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
const document = { activeElement: null, getElementById: id => store[id] || (store[id] = el(id)),
  querySelectorAll: () => [], querySelector: () => null, addEventListener(){} };
const mkLS = (init = {}) => ({ _d: Object.assign({}, init), get length(){ return Object.keys(this._d).length; },
  key(i){ const k = Object.keys(this._d); return i < k.length ? k[i] : null; },
  getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; } });
const fetch = async () => { throw new Error('offline'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const src = require('fs').readFileSync(__dirname + '/../finance_app_artifact.html', 'utf8');
const js = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0]
  .replace(/\ninit\(\);\s*$/, '\n');
const bugs = [];
const base = txs => ({ version: 2, assets: [], liabilities: [], trades: [], budgets: [], netWorthHistory: [], instruments: [],
  transactions: txs.map(id => ({ id, date: '2026-09-01', cat: '其他', desc: id, amount: -1 })) });
const ids = st => st.transactions.map(t => t.id).sort().join(',');

// 假雲端:寫入先排隊,測試呼叫 deliver() 才送到各台(照順序)
function mkCloud(){
  const c = { doc: undefined, subs: [], queue: [], other: {} };   // other:備份等其他路徑
  c.db = () => ({
    doc: path => ({
      async get(){ const v = path === 'state/finance' ? c.doc : c.other[path]; return { exists: v !== undefined, data: () => JSON.parse(JSON.stringify(v)) }; },
      async set(d){ if (path !== 'state/finance'){ c.other[path] = JSON.parse(JSON.stringify(d)); return; }
        c.doc = JSON.parse(JSON.stringify(d)); c.queue.push(JSON.parse(JSON.stringify(d))); },
      async delete(){ delete c.other[path]; }, onSnapshot(cb){ if (path === 'state/finance') c.subs.push(cb); return () => {}; }
    }),
    collection: name => ({ async get(){ return { docs: Object.keys(c.other).filter(k => k.startsWith(name + '/')).map(k => ({ id: k.slice(name.length + 1) })) }; } })
  });
  c.deliver = () => { const q = c.queue.splice(0); q.forEach(d => c.subs.forEach(cb => cb({ exists: true, data: () => JSON.parse(JSON.stringify(d)) }))); };
  return c;
}
function boot(cloud, lsInit){
  const window = { claude: { use: async n => (n === 'db' ? cloud.db() : null) } };
  const f = new Function('localStorage', 'window', 'document', 'fetch',
    js + '; return { init, save, scheduleSave, restoreBackup, backupApi, get state(){ return state; }, set state(v){ state = v; } };');
  return f(mkLS(lsInit), window, document, fetch);
}

(async () => {
  // 1) 剛更新:雲端(新版推的,_tomb 是空的)只有 a;這台的本機是舊資料 a + old1(old1 別台早刪了),沒有待合併的基準
  {
    const cloud = mkCloud();
    cloud.doc = Object.assign(base(['a']), { _rev: 'r1', _parent: '', _tomb: {} });
    const B = boot(cloud, { financeAppState_v2: JSON.stringify(base(['a', 'old1'])) });
    B.init(); await wait(100);
    console.log('1. 剛更新、本機是舊資料:', ids(B.state), '| 雲端', ids(cloud.doc));
    if (ids(B.state) !== 'a' || ids(cloud.doc) !== 'a') bugs.push('剛更新到有刪除紀錄的版本,舊本機資料裡別台刪掉的東西被救回來了');
  }
  // 2) 兩台同步好 a,b;A 刪掉 b(還在存檔延遲裡)就收到 B 新增 c 的那份 → a,c
  {
    const cloud = mkCloud();
    cloud.doc = base(['a', 'b']);
    const A = boot(cloud), B = boot(cloud);
    A.init(); B.init(); await wait(100);
    B.state.transactions.push({ id: 'c', date: '2026-09-02', cat: '其他', desc: 'c', amount: -1 });
    await B.save();
    A.state.transactions = A.state.transactions.filter(t => t.id !== 'b');
    A.scheduleSave();
    cloud.deliver();                  // B 的那份在 A 存檔之前送到
    await wait(600); cloud.deliver(); await wait(50); cloud.deliver(); await wait(50);
    console.log('2. 存檔延遲裡收到別台的:A', ids(A.state), '| B', ids(B.state), '| 雲端', ids(cloud.doc));
    if (ids(A.state) !== 'a,c' || ids(B.state) !== 'a,c' || ids(cloud.doc) !== 'a,c') bugs.push('按了刪除、存檔前收到別台的改動,刪掉的被補回來或新增的不見了');
  }
  // 3) A 刪掉 b、同步到 B;A 再從舊備份(有 b)還原 → b 回來,B 也要有 b
  {
    const cloud = mkCloud();
    cloud.doc = base(['a', 'b']);
    const A = boot(cloud), B = boot(cloud);
    A.init(); B.init(); await wait(100);
    await A.backupApi().put('2026-09-01', base(['a', 'b']));
    A.state.transactions = A.state.transactions.filter(t => t.id !== 'b');
    await A.save(); cloud.deliver(); await wait(50);
    if (ids(B.state) !== 'a') bugs.push('A 刪掉的 b 沒有同步到 B');
    await A.restoreBackup('2026-09-01'); cloud.deliver(); await wait(600); cloud.deliver(); await wait(50);
    console.log('3. 還原舊備份:A', ids(A.state), '| B', ids(B.state));
    if (ids(A.state) !== 'a,b' || ids(B.state) !== 'a,b') bugs.push('從舊備份還原的資料被刪除紀錄刪掉了(A ' + ids(A.state) + ',B ' + ids(B.state) + ')');
  }
  // 4) A 刪 b、B 同時改 b 的金額(兩邊都還沒收到對方的)→ 刪除優先,最後兩台都沒有 b
  {
    const cloud = mkCloud();
    cloud.doc = base(['a', 'b']);
    const A = boot(cloud), B = boot(cloud);
    A.init(); B.init(); await wait(100);
    A.state.transactions = A.state.transactions.filter(t => t.id !== 'b');
    B.state.transactions.find(t => t.id === 'b').amount = -999;
    await A.save(); await B.save();
    cloud.deliver(); await wait(600); cloud.deliver(); await wait(600); cloud.deliver(); await wait(50);
    console.log('4. 一台刪、一台改同一筆:A', ids(A.state), '| B', ids(B.state), '| 雲端', ids(cloud.doc));
    if (ids(A.state) !== ids(B.state) || ids(A.state) !== ids(cloud.doc)) bugs.push('一台刪、一台改同一筆,兩台最後不一致');
    if (A.state.transactions.some(t => t.id === 'b')) bugs.push('一台刪、一台改同一筆,刪掉的又回來了');
  }
  // 5) 兩台同時打開、各自記了同一筆自動利息(固定 id);B 還沒存檔就把它刪了,之後收到 A 的那份 → 不能又冒出來
  {
    const cloud = mkCloud();
    cloud.doc = Object.assign(base(['a']), { leverage: { creditLimit: 5000000, draws: [{ id: 'dr1', label: 'x', amount: 1000000, useDate: '2026-01-05', note: '', repayments: [] }] } });
    const A = boot(cloud), B = boot(cloud);
    A.init(); B.init(); await wait(100);
    const auto = st => st.transactions.filter(t => String(t.id).startsWith('levi-')).map(t => t.id).join(',');
    const lid = auto(B.state);
    if (!lid || auto(A.state) !== lid) bugs.push('情境 5 前提:兩台應該各自記了同一筆自動利息,A ' + auto(A.state) + ' B ' + lid);
    B.state.transactions = B.state.transactions.filter(t => t.id !== lid);
    B.scheduleSave();
    await wait(600); cloud.deliver(); await wait(600); cloud.deliver(); await wait(600); cloud.deliver(); await wait(50);
    console.log('5. 兩台記同一筆自動利息、一台刪掉:A', auto(A.state) || '(無)', '| B', auto(B.state) || '(無)', '| 雲端', auto(cloud.doc) || '(無)');
    if (auto(A.state) || auto(B.state) || auto(cloud.doc)) bugs.push('另一台記的同一筆自動利息同步過來,刪掉的又回來了');
  }
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
  process.exit(bugs.length ? 1 : 0);
})();
