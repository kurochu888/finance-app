const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
let focused = null;
global.document = { get activeElement(){ return focused; },
  getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
global.fetch = async () => { throw new Error('offline'); };

// ---- 假雲端 ----
const cloudDocs = {};
let snapCb = null, snapErr = null, subs = 0, unsubs = 0, failGet = 0, writeLog = [], failNextWrite = false;
const mkDoc = (path) => ({
  async get(){ if (path === 'state/finance' && failGet > 0){ failGet--; throw { code:'unavailable', message:'client is offline' }; }
              return { exists: cloudDocs[path] !== undefined,
                        data: () => JSON.parse(JSON.stringify(cloudDocs[path])) }; },
  async set(d){
    if (failNextWrite){ failNextWrite = false; throw { code:'unavailable', message:'寫入失敗' }; }
    cloudDocs[path] = JSON.parse(JSON.stringify(d));
    writeLog.push(path);
  },
  async delete(){ delete cloudDocs[path]; },
  onSnapshot(cb, err){ if (path === 'state/finance'){ snapCb = cb; snapErr = err; subs++; } return () => { unsubs++; }; }
});
const db = {
  doc: mkDoc,
  collection: (c) => ({ async get(){
    return { docs: Object.keys(cloudDocs).filter(k => k.indexOf(c + '/') === 0)
      .map(k => ({ id: k.slice(c.length + 1) })) };
  }})
};
global.window = { claude: { use: async (n) => (n === 'db' ? db : null) } };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../finance_app_artifact.html','utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A = {
  get state(){return state}, set state(v){state=v},
  get storageMode(){return storageMode}, get lastPushed(){return lastPushed},
  get pendingRemote(){return pendingRemote},
  connectCloud, save, onRemote, applyRemote, scheduleSave, maybeBackup, emptyState, sampleData, normalize, renderAll,
  importJSON, todayISO, shiftMonth, maybePostInterest, thisMonth, diagLoad, onForeground,
  get cloud(){return cloud}, set CLOUD_RETRY_MS(v){CLOUD_RETRY_MS=v}, get cloudRetryApi(){return cloudRetryApi}, syncFirstTime
};`);
/* 還本規則遷移(repayRule)跟第一次同步(2026-10-19 使用者的診斷報告):開 app 時還沒連上雲端就先補記了 10 月還本 12,950,
   接著雲端那份(另一台舊版寫的,沒有補記、沒有 repayRule)蓋過來,補記不見了,repayRule 卻從本機補回來,之後再也不補。
   node tests/repayrule.js [stuck]:stuck = 已經卡住的資料(雲端、本機都是 repayRule 2、補記被記成刪除) */
const RealDate = Date; const fixed = new RealDate('2026-10-19T07:45:00').getTime();
global.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [fixed])); } static now(){ return fixed; } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const bugs = [], must = (c, m) => { if (!c) bugs.push(m); };
const stuck = process.argv[2] === 'stuck';
(async () => {
  const mk = () => { const s = A.emptyState();
    Object.assign(s.leverage, { payDay: 17, annualRate: 2.58, creditLimit: 8000000, rateHistory: [], repayPosted: ['2026-10'], interestPosted: ['2026-10'] });
    s.leverage.draws = [
      { id: 'w1', label: 'a', amount: 200000, useDate: '2026-10-05', note: '', repayments: [] },
      { id: 'w2', label: 'b', amount: 2390000, useDate: '2026-10-07', note: '', repayments: [] }];
    return s; };
  const cloudCopy = JSON.parse(JSON.stringify(A.normalize(mk()))); delete cloudCopy.leverage.repayRule; cloudCopy._rev = 'r1';
  const local = A.normalize(mk()); delete local.leverage.repayRule;
  if (stuck){
    cloudCopy.leverage.repayRule = 2; local.leverage.repayRule = 2;
    cloudCopy._tomb = ['w1', 'w2'].map(id => ({ k: `draws/i:${id}/repayments|i:autorepay202610`, t: fixed - 60000 }));
  }
  cloudDocs['state/finance'] = cloudCopy;
  A.state = A.normalize(local);
  A.maybePostInterest();   // 開 app 時(還沒連上雲端)
  const tot = st => st.leverage.draws.reduce((a, d) => a + d.repayments.reduce((b, r) => b + r.amount, 0), 0);
  must(tot(A.state) === 12950, '開 app 時要補記 10 月還本 12,950:' + tot(A.state));
  await A.connectCloud(); await wait(2500);
  console.log((stuck ? '已經卡住的資料' : '舊版寫的雲端') + ':同步後還本', tot(A.state), '| 雲端', tot(cloudDocs['state/finance']));
  must(tot(A.state) === 12950, '第一次同步之後還本不能不見:' + tot(A.state));
  must(tot(cloudDocs['state/finance']) === 12950, '補記要推上雲端:' + tot(cloudDocs['state/finance']));
  if (bugs.length){ console.log('\n發現 ' + bugs.length + ' 個問題:'); bugs.forEach(b => console.log('  ✗ ' + b)); process.exitCode = 1; }
  else console.log('沒有發現問題');
})();
