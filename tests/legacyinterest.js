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
/* 2026-10-06 以前的版本在 10/01 記的理財型利息,本月繳款日到了換成照繳款日算的(postLeverageInterest 開頭)。
   另一台還留著舊的那筆、這台還沒推上去就收到它的改動時:合併的「同月自動利息只留一筆」不能把新記的丟掉 */
const RealDate = Date; let fixed = new RealDate('2026-10-16T09:00:00').getTime();
global.Date = class extends RealDate { constructor(...a){ super(...(a.length ? a : [fixed])); } static now(){ return fixed; } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const bugs = [], must = (c, m) => { if (!c) bugs.push(m); };
(async () => {
  const s = A.emptyState();
  Object.assign(s.leverage, { payDay: 17, annualRate: 2.6, rateHistory: [], repayPosted: ['2026-10'], repayRule: 3, interestPosted: ['2026-10'], autoRepay: false });
  s.leverage.draws = [{ id: 'w1', label: 'a', amount: 2590000, useDate: '2026-10-07', note: '', repayments: [] }];
  s.transactions = [{ id: 'oldoct', date: '2026-10-01', cat: '房貸利息', desc: '槓桿借款利息(自動記入)', amount: -430 }];
  const doc = JSON.parse(JSON.stringify(A.normalize(s))); doc._rev = 'r1';
  cloudDocs['state/finance'] = doc;
  A.state = A.normalize(JSON.parse(JSON.stringify(s)));
  await A.connectCloud(); await wait(2500);
  // 10/19 回到前景:這台換掉舊的那筆;還沒推上去,另一台(舊版)剛好記了一筆早餐推上去
  fixed = new RealDate('2026-10-19T08:00:00').getTime();
  A.maybePostInterest();
  const other = JSON.parse(JSON.stringify(cloudDocs['state/finance']));
  other.transactions.push({ id: 'bf', date: '2026-10-19', cat: '餐飲', desc: '早餐', amount: -55 });
  other._parent = other._rev; other._rev = 'other1';
  cloudDocs['state/finance'] = JSON.parse(JSON.stringify(other));
  A.applyRemote(other);
  await wait(2500);
  const ids = st => st.transactions.map(t => t.id).sort().join();
  console.log('這台:', ids(A.state), '| 雲端:', ids(cloudDocs['state/finance']));
  for (const [who, st] of [['這台', A.state], ['雲端', cloudDocs['state/finance']]]){
    must(st.transactions.some(t => t.id === 'levi-20261017'), who + ':照繳款日記的 10/17 利息不見了(被當成同月重複丟掉)');
    must(!st.transactions.some(t => t.id === 'oldoct'), who + ':舊版 10/01 那筆還在');
    must(st.transactions.some(t => t.id === 'bf'), who + ':另一台記的早餐沒合併進來');
  }
  if (bugs.length){ console.log('\n發現 ' + bugs.length + ' 個問題:'); bugs.forEach(b => console.log('  ✗ ' + b)); process.exitCode = 1; }
  else console.log('沒有發現問題');
})();
