/* 離線時記的帳,關掉 app 再打開要還在(2026-09 抓到:第一次同步是雲端整份蓋掉本機,離線記的就不見了)。
   模擬兩次打開 app:共用同一個 localStorage 跟假雲端,Firestore 離線時 set() 的 promise 一直不回來。 */
const mkEl = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;}, setAttribute(){}, getAttribute(){} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=mkEl(id)), querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;}, key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
global.fetch = async () => { throw new Error('offline'); };
const cloudDocs = {}; let offline = false;
const mkDoc = (path) => ({
  async get(){ return { exists: cloudDocs[path] !== undefined, data: () => JSON.parse(JSON.stringify(cloudDocs[path])) }; },
  set(d){ if (offline) return new Promise(() => {}); cloudDocs[path] = JSON.parse(JSON.stringify(d)); return Promise.resolve(); },   // Firestore 離線時 promise 一直不回來
  async delete(){ delete cloudDocs[path]; },
  onSnapshot(cb){ return () => {}; }
});
const db = { doc: mkDoc, collection: (c) => ({ async get(){ return { docs: [] }; } }) };
global.window = { claude: { use: async (n) => (n === 'db' ? db : null) } };
const src = require('fs').readFileSync(__dirname + '/../finance_app_artifact.html','utf8');
const js = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
const boot = () => (0, eval)('(() => {' + js.replace(/\ninit\(\);\s*$/, '\n') + '; return { init, get state(){return state}, connectCloud, save, scheduleSave }; })()');
const wait = ms => new Promise(r => setTimeout(r, ms));
const bugs = [];
const fresh = () => ({ version:2, assets:[{id:'x', name:'現金', amount:100}], liabilities:[], trades:[], transactions:[], netWorthHistory:[], budgets:[], instruments:[] });
(async () => {
  // 1) 離線記一筆 → 關掉 → 有網路再打開:那筆要還在,也要推上雲端;推完暫存的基準要清掉
  cloudDocs['state/finance'] = fresh();
  let A = boot(); A.init(); await wait(50);
  offline = true;
  A.state.transactions.push({ id:'off1', date:'2026-09-20', cat:'餐飲', desc:'捷運上記的', amount:-120 });
  A.scheduleSave(); await wait(500);
  offline = false;
  // 2) 離線這段時間,另一台裝置也改了雲端:兩邊都要留下
  cloudDocs['state/finance'].assets[0].amount = 999;
  cloudDocs['state/finance'].transactions.push({ id:'other', date:'2026-09-21', cat:'其他', desc:'另一台', amount:-1 });
  let B = boot(); B.init(); await wait(700);
  const ids = B.state.transactions.map(t => t.id);
  console.log('1. 重新打開後的交易:', ids.join(','), '| 資產', B.state.assets[0].amount);
  if (!ids.includes('off1')) bugs.push('離線記的那筆,重新打開後不見了');
  if (!ids.includes('other') || B.state.assets[0].amount !== 999) bugs.push('離線期間別台的改動沒有合併進來');
  if (!(cloudDocs['state/finance'].transactions || []).some(t => t.id === 'off1')) bugs.push('離線記的那筆沒有推上雲端');
  if (localStorage.getItem('financeSyncBase')) bugs.push('推上去之後暫存的合併基準沒有清掉(白佔空間)');
  // 3) 本機沒有未推上去的修改:照舊以雲端那份為準
  cloudDocs['state/finance'].assets[0].amount = 7;
  const C = boot(); C.init(); await wait(700);
  console.log('3. 沒有離線修改時:資產', C.state.assets[0].amount);
  if (C.state.assets[0].amount !== 7) bugs.push('沒有離線修改時,雲端的改動沒套用');
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
  if (bugs.length) process.exitCode = 1;
})();
