/* 診斷報告:紀錄(diag)、金額遮罩跟 👁 開關、沒接住的錯誤、健康檢查抓得到埋進去的問題、複製報告。 */
const RealDate = Date;
let simNow = new RealDate('2026-10-09T10:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a){ super(...(a.length ? a : [simNow])); }
  static now(){ return simNow; }
}
global.Date = FakeDate;
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, className:'',
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
const winHandlers = {};
global.window = { claude: undefined, addEventListener(type, fn){ winHandlers[type] = fn; } };
let clipboardOk = true, copied = '';
// Node 21 起有內建唯讀的 navigator,直接指定會被忽略,要用 defineProperty 蓋掉
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async t => { if (!clipboardOk) throw new Error('blocked'); copied = t; } } } });
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, sampleData, onClick, renderAll,
  diag, diagLoad, diagReport, diagStartup, healthCheck, diagMask, $n, DIAG_KEY, DIAG_MAX, togglePrivacy, get privacy(){return privacy},
  maybeAutoRepay, set tradeDraft(v){tradeDraft=v}, set currentTab(v){currentTab=v}, get diagText(){return diagText}, get dataMsg(){return dataMsg},
  computeLeverage };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const flush = () => new Promise(r => setTimeout(r, 0));
const logText = () => A.diagLoad().map(x => x.m).join('\n');

(async () => {
  console.log('啟動就記一筆、紀錄不進 state(不同步)');
  must(A.diagLoad().some(x => x.k === '啟動'), '打開 app 要記一筆啟動');
  must(!JSON.stringify(A.state).includes('⟦'), '紀錄不能出現在 state 裡');
  A.diagStartup(); A.diagStartup();
  must(A.diagLoad().filter(x => x.k === '啟動').length === 1, '同一天同一版打開好幾次只記一次');
  simNow += 86400000; A.diagStartup(); simNow -= 86400000;
  const st = A.diagLoad().filter(x => x.k === '啟動');
  must(st.length === 1 && st[0].c === 2 && st[0].t.startsWith('2026-10-10'), '隔天打開要再記(連續同一句合併成 ×2、時間更新):' + JSON.stringify(st));
  console.log('  ok');

  console.log('同一件事連續發生只加次數,最多留 DIAG_MAX 筆');
  A.diag('報價', '抓不到任何報價'); A.diag('報價', '抓不到任何報價');
  const last = A.diagLoad()[A.diagLoad().length - 1];
  must(last.m === '抓不到任何報價' && last.c === 2, '連續兩次要變成 ×2:' + JSON.stringify(last));
  for (let i = 0; i < A.DIAG_MAX + 50; i++) A.diag('測試', 'x' + i);
  must(A.diagLoad().length === A.DIAG_MAX, '超過上限要丟掉最舊的:' + A.diagLoad().length);
  must(JSON.parse(localStorage.getItem(A.DIAG_KEY)).length === A.DIAG_MAX, '要存進 localStorage');
  A.onClick({ dataset:{ act:'diag-clear' } }); A.onClick({ dataset:{ act:'diag-clear' } });
  must(A.diagLoad().length === 0, '清除紀錄要按兩次清掉');
  console.log('  ok');

  console.log('金額照 👁 開關遮:隱藏時記的,之後打開金額也看得到');
  if (!A.privacy) A.togglePrivacy();
  A.diag('自動記帳', '理財型利息 ' + A.$n(1532));
  must(A.diagReport().includes('••••') && !A.diagReport().includes('1,532'), '隱藏金額時報告裡的金額要變 ••••');
  A.togglePrivacy();
  must(!A.privacy && A.diagReport().includes('理財型利息 1,532'), '顯示金額時報告要看得到數字:' + A.diagReport().split('\n').find(l => l.includes('理財型利息')));
  console.log('  ok');

  console.log('沒接住的錯誤記下來,附上分頁跟最後操作');
  must(typeof winHandlers.error === 'function' && typeof winHandlers.unhandledrejection === 'function', '要掛 window error / unhandledrejection');
  A.onClick({ dataset:{ act:'fold', v:'nothing' } });
  winHandlers.error({ message: 'TypeError: x is undefined', lineno: 1234, colno: 5 });
  winHandlers.unhandledrejection({ reason: new Error('同步逾時') });
  const errs = A.diagLoad().filter(x => x.k === '錯誤').map(x => x.m);
  must(errs.some(m => m.includes('x is undefined') && m.includes('@1234') && m.includes('最後操作 click fold')), '錯誤要有訊息、行號、最後操作:' + errs.join(' | '));
  must(errs.some(m => m.includes('同步逾時')), 'Promise 沒接住的錯誤也要記');
  console.log('  ok');

  console.log('自動記帳寫進紀錄(房貸買進自動新增動用、最低還本)');
  A.state = A.normalize(A.emptyState());
  A.tradeDraft = { date:'2026-10-08', symbol:'00631L', action:'buy', source:'loan', shares:'10000', price:'41', amount:'', fee:'0', note:'', loanAmt:'', autoDraw:true };
  A.onClick({ dataset:{ act:'add-trade' } });
  must(logText().includes('房貸買進 00631L ⟦410,000⟧,自動新增動用 ⟦410,000⟧(動用日 2026-10-12'), '自動新增動用要記:' + logText().split('\n').pop());
  A.state.leverage.autoRepay = true; A.state.leverage.repayPermille = 5; A.state.leverage.repayPosted = ['2026-10'];
  A.state.leverage.draws[0].useDate = '2026-08-01';
  simNow = new RealDate('2026-11-02T10:00:00').getTime();
  A.maybeAutoRepay();
  must(logText().includes('2026-11 理財型最低還本 ⟦2,050⟧'), '自動還本要記金額跟算式:' + logText().split('\n').pop());
  simNow = new RealDate('2026-10-09T10:00:00').getTime();
  console.log('  ok');

  console.log('健康檢查抓得到埋進去的問題');
  const s = A.normalize(A.emptyState());
  s.trades = [
    { id:'b1', date:'2026-09-01', symbol:'00631L', action:'buy', source:'loan', shares:1000, price:40, amount:0, fee:0, note:'' },
    { id:'s1', date:'2026-09-05', symbol:'00631L', action:'sell', source:'cash', shares:3000, price:40, amount:0, fee:0, note:'' },
  ];
  s.leverage.draws = [{ id:'d1', label:'九月', amount:500000, useDate:'2026-09-03', note:'', repayments:[{ id:'r1', date:'2026-09-01', amount:1000 }] }];
  s.leverage.autoInterest = true; s.leverage.interestPosted = ['2026-07', '2026-09'];
  s.transactions = [
    { id:'levi-20260901', date:'2026-09-01', cat:'房貸利息', desc:'槓桿借款利息(自動記入)', amount:-100 },
    { id:'levi-20260915', date:'2026-09-15', cat:'房貸利息', desc:'槓桿借款利息(自動記入)', amount:-100 },
  ];
  A.state = s;
  const warns = A.healthCheck().filter(x => x.lv === 'warn').map(x => A.diagMask(x.t));
  const has = (re, what) => must(warns.some(w => re.test(w)), what + ':' + warns.join(' | '));
  has(/還款.*早於動用日/, '還款早於動用日');
  has(/理財型自動利息處理過的月份中間缺 2026-08/, '自動利息漏掉的月份');
  has(/2026-09 理財型自動利息記了 2 筆/, '同一個月記兩次利息');
  has(/動用合計跟房貸買進合計差/, '動用跟房貸買進對不起來');
  has(/賣出 00631L 3000 股,當時只持有 1000 股/, '賣超');
  must(A.healthCheck().some(x => x.lv === 'info' && /借款:銀行已撥款/.test(x.t)), '要列借款組成');
  console.log('  ok');

  console.log('複製報告:成功直接進剪貼簿,失敗改成可以全選的框');
  A.currentTab = 'overview';
  A.onClick({ dataset:{ act:'diag-copy' } }); await flush();
  must(copied.startsWith('財務 app 診斷報告') && copied.includes('== 健康檢查') && copied.includes('== 紀錄'), '剪貼簿內容要是完整報告');
  must(/已複製診斷報告/.test(A.dataMsg), '要說已複製');
  clipboardOk = false;
  A.onClick({ dataset:{ act:'diag-copy' } }); await flush();
  must(A.diagText.startsWith('財務 app 診斷報告') && store.content.innerHTML.includes('<textarea readonly'), '複製失敗要顯示全文框');
  A.onClick({ dataset:{ act:'fold', v:'diag' } });
  must(store.content.innerHTML.includes('最近的紀錄') && store.content.innerHTML.includes('<textarea readonly'), '展開診斷紀錄時全文框要還在、要列最近紀錄');
  console.log('  ok');

  if (bugs.length){
    console.log('\n發現 ' + bugs.length + ' 個問題:');
    bugs.forEach(b => console.log('  ✗ ' + b));
    process.exitCode = 1;
  }else console.log('\n沒有發現問題');
})();
