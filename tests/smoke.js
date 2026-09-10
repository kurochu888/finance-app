// 極簡 DOM stub,只為跑一次 render 檢查執行期錯誤
const el = (id) => ({
  id, innerHTML:'', textContent:'', value:'', scrollTop:0,
  style:{}, dataset:{}, classList:{ toggle(){}, add(){}, remove(){}, contains(){return false;} },
  addEventListener(){}, closest(){ return null; }
});
const store = {};
global.document = {
  activeElement: null,
  getElementById: (id) => store[id] || (store[id] = el(id)),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener(){}
};
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };   // 測試時不連外網
global.localStorage = {
  _d:{},
  get length(){ return Object.keys(this._d).length; },
  key(i){ const ks = Object.keys(this._d); return i < ks.length ? ks[i] : null; },
  getItem(k){ return this._d[k] ?? null; },
  setItem(k,v){ this._d[k]=String(v); },
  removeItem(k){ delete this._d[k]; }
};

const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html','utf8');
// 取最長的那段 <script>,也就是 app 本體(頁面另有 bootstrap 與 sw 註冊)
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = blocks.sort((a, b) => b.length - a.length)[0];

// eval 內的 let/const 不會外洩,用存取器把活繫結接出來
const bridge = `
globalThis.A = {
  get state(){return state}, set state(v){state=v},
  get draft(){return draft}, set draft(v){draft=v},
  set currentTab(v){currentTab=v},
  set viewMonth(v){viewMonth=v},
  set editingTx(v){editingTx=v},
  get pendingConfirm(){return pendingConfirm},
  get currentTabName(){return currentTab},
  renderOverview,
  get draftError(){return draftError},
  get backupList(){return backupList},
  maybePostInterest, maybeBackup, loadBackups, restoreBackup, localBackupApi,
  computePosition, heldShares, defaultFee, accruedInterest, computeRisk, maybeSnapshot, lineChart,
  computeStress, knownCats, accrue, outstanding, stateCSV, chartCaption, pickChartPoint,
  monthlyHistory, writeLocal, maybeBackup, shiftMonth, xirr, cashFlows, balanceAt,
  maybeDailySnapshot, dailySlice, set chartRange(v){chartRange=v},
  set levTab(v){levTab=v}, get levTab(){return levTab},
  get chartData(){return chartData},
  get tradeDraft(){return tradeDraft}, set tradeDraft(v){tradeDraft=v},
  txOfMonth, computeLeverage2: null,
  renderAll, sampleData, emptyState, onClick, onField,
  computeLeverage, monthFlow, netWorth, thisMonth, todayISO
};`;
eval(js + bridge);

const inst = id => A.state.instruments.find(x => x.id === id);
const tabs = ['overview','assets','ledger','leverage','help'];
function pass(label){
  for (const t of tabs){
    A.currentTab = t;
    for (const lt of (t === 'leverage' ? ['overview','signal','log','setup'] : [null])){
      if (lt) A.levTab = lt;
      A.renderAll();
      const html = store.content.innerHTML;
      const tag = t + (lt ? '/' + lt : '');
      if (!html || html.length < 50) throw new Error(label+'/'+tag+' 產出過短');
      const i = Math.max(html.indexOf('undefined'), html.indexOf('NaN'));
      if (i >= 0) throw new Error(label+'/'+tag+' 出現 undefined/NaN: '+html.slice(Math.max(0,i-90), i+40));
    }
    A.levTab = 'overview';
  }
  console.log('  ok:', label);
}

console.log('空白狀態'); pass('empty');

console.log('範例資料');
A.state = A.sampleData();
A.viewMonth = A.thisMonth();
pass('sample');
console.log('  淨資產', A.netWorth(), '| 本月收支', JSON.stringify(A.monthFlow(A.thisMonth())));

console.log('互動');
A.onClick({ dataset:{ act:'add-asset' } });
A.onClick({ dataset:{ act:'add-budget' } });
A.onClick({ dataset:{ act:'snap-networth' } });
A.draft = { date: A.todayISO(), type:'income', cat:'獎金', desc:'年終', amount:'50000' };
A.onClick({ dataset:{ act:'add-tx' } });
const tx = A.state.transactions[A.state.transactions.length-1];
console.log('  新增:', tx.cat, tx.amount, '| 本月收入', A.monthFlow(A.thisMonth()).income);
console.log('  記錄淨資產:', JSON.stringify(A.state.netWorthHistory.slice(-1)));
A.editingTx = tx.id;
pass('after-edits');

console.log('二次確認刪除');
A.onClick({ dataset:{ act:'del-tx', id: tx.id } });
console.log('  第一次 → pendingConfirm =', A.pendingConfirm, '| 筆數', A.state.transactions.length);
A.onClick({ dataset:{ act:'del-tx', id: tx.id } });
console.log('  第二次 → 筆數', A.state.transactions.length);

console.log('空金額擋下');
A.draft = { date: A.todayISO(), type:'expense', cat:'', desc:'', amount:'' };
A.onClick({ dataset:{ act:'add-tx' } });
console.log('  draftError =', JSON.stringify(A.draftError));

console.log('欄位輸入');
const a = A.state.assets[0];
A.onField('aa-'+a.id, { value:'2500000' });
console.log('  資產改為', a.amount, '→ 淨資產', A.netWorth());
A.onField('tr-date-t1', { value: A.todayISO() });
const r = A.computeLeverage();
console.log('  已動用', r.usedAmount, '| 月息', Math.round(r.monthlyInterest));

console.log('趨勢狀態改變時,總覽頁跟訊號分頁都要跳提醒(回歸測試)');
A.state = A.sampleData();
A.viewMonth = A.thisMonth();
const i631 = inst('00631L');
i631.trend.lastSeenStatus = 'WAIT_RECOVER';   // 假裝上次看到的是接刀中,跟目前算出來的 HOLD 不一樣
A.currentTab = 'overview';
A.renderAll();
if (!store.content.innerHTML.includes('狀態變成')) throw new Error('總覽頁沒有顯示趨勢狀態改變的提醒');
console.log('  總覽頁有顯示 ✓');
A.currentTab = 'leverage';
A.levTab = 'signal';
A.renderAll();
if (!store.content.innerHTML.includes('狀態變成')) throw new Error('訊號分頁沒有顯示趨勢狀態改變的提醒');
console.log('  訊號分頁有顯示 ✓');
A.onClick({ dataset:{ act:'ack-trend', id:i631.key } });
A.renderAll();
if (store.content.innerHTML.includes('狀態變成')) throw new Error('按過「知道了」之後提醒還在');
console.log('  確認後提醒消失 ✓');
A.levTab = 'overview';

console.log('部位損益');
A.state = A.emptyState();
inst('00631L').price = 40;      // 現價
inst('00675L').price = 300;
A.state.leverage.annualRate = 2.6;
A.state.trades = [
  { id:'a', date:'2026-01-05', symbol:'00631L', action:'buy',  shares:10000, price:30, fee:428, source:'cash', note:'' },
  { id:'b', date:'2026-03-05', symbol:'00631L', action:'buy',  shares:10000, price:35, fee:499, source:'loan', note:'' },
  { id:'c', date:'2026-06-05', symbol:'00631L', action:'sell', shares:5000,  price:38, fee:461, source:'cash', note:'' }
];
let P = A.computePosition();
console.log('  持股', A.heldShares('00631L'), '股(買 20000 賣 5000)');
if (A.heldShares('00631L') !== 15000) throw new Error('持股加總錯誤');
console.log('  自有投入', Math.round(P.buyCash), '| 房貸投入', Math.round(P.buyLoan));
if (Math.round(P.buyCash) !== 300428 || Math.round(P.buyLoan) !== 350499) throw new Error('投入金額錯誤');
// 平均成本 = (300428 + 350499) / 20000 = 32.546…
const avg = (300428 + 350499) / 20000;
const expRealized = (5000 * 38 - 461) - avg * 5000;
console.log('  平均成本', avg.toFixed(4), '| 已實現', Math.round(P.realized), '(預期', Math.round(expRealized) + ')');
if (Math.abs(P.realized - expRealized) > 1) throw new Error('已實現損益算錯');
const expUnreal = 15000 * 40 - (300428 + 350499 - avg * 5000);
console.log('  未實現', Math.round(P.unrealized), '(預期', Math.round(expUnreal) + ')');
if (Math.abs(P.unrealized - expUnreal) > 1) throw new Error('未實現損益算錯');
console.log('  利息', Math.round(P.interest), '(未填動用日期時應為 0)');
if (P.interest !== 0) throw new Error('沒動用卻算出利息');
if (Math.abs(P.total - (P.unrealized + P.realized)) > 0.01) throw new Error('整體損益組成錯誤');

// 動用房貸後,利息要被扣掉
A.state.leverage.tranches[0].useDate = '2026-01-01';
A.state.leverage.tranches[0].amount = 1000000;
P = A.computePosition();
const days = Math.floor((Date.now() - new Date('2026-01-01T00:00:00').getTime()) / 86400000);
console.log('  借款', days, '天 → 累積利息', Math.round(P.interest), '| 整體損益', Math.round(P.total));
if (!(P.interest > 0)) throw new Error('利息沒算進來');
if (Math.abs(P.total - (P.unrealized + P.realized - P.interest)) > 0.01) throw new Error('整體損益沒扣利息');
console.log('  整體損益 = 未實現 + 已實現 − 利息 ✓');

// 手續費預設值
const f = A.defaultFee('buy', 300000);
console.log('  30 萬買進預估手續費', f, '(0.1425%)');
if (Math.abs(f - Math.round(300000 * 0.001425)) > 1) throw new Error('手續費預設值錯誤');
if (A.defaultFee('buy', 1000) !== 20) throw new Error('未套用最低 20 元');

// 有紀錄時股數改由紀錄推算
inst('00631L').shares = 999;
const r2 = A.computeLeverage();
const h631 = r2.holdings.find(h => h.id === '00631L');
console.log('  手填股數 999 被忽略,實際採用', h631.shares);
if (h631.shares !== 15000) throw new Error('沒有改用買賣紀錄的股數');

console.log('曝險指標');
A.state = A.emptyState();
A.state.assets = [{ id:'a1', name:'現金', amount:5000000 }];
A.state.liabilities = [];
inst('00631L').price = 40;
A.state.leverage.tranches[0].useDate = '2026-01-01';
A.state.leverage.tranches[0].amount = 1000000;
A.state.trades = [{ id:'t1', date:'2026-01-05', symbol:'00631L', action:'buy', shares:75000, price:32, fee:3420, source:'loan', note:'' }];
let K = A.computeRisk();
console.log('  部位市值', Math.round(K.pv), '| 借款', Math.round(K.loan), '| 部位淨值', Math.round(K.equity));
if (Math.round(K.pv) !== 3000000) throw new Error('部位市值錯誤');
if (Math.round(K.equity) !== 2000000) throw new Error('部位淨值錯誤');
console.log('  槓桿倍數', K.leverage.toFixed(2), '(3,000,000 / 2,000,000 = 1.50)');
if (Math.abs(K.leverage - 1.5) > 0.001) throw new Error('槓桿倍數錯誤');
console.log('  實質曝險', Math.round(K.exposure), '(正2 → 市值 ×2)');
if (Math.round(K.exposure) !== 6000000) throw new Error('曝險倍數沒算正2');
console.log('  房貸總額度', Math.round(K.creditLimit), '| 分母合計', Math.round(K.capacity));
// 曝險比例 = 市值×2 / (部位淨值 + 總額度) = 6,000,000 / (2,000,000 + 5,000,000)
if (Math.round(K.capacity) !== 7000000) throw new Error('分母仍把已借的錢算兩次');
const expected = 6000000 / 7000000 * 100;
console.log('  曝險比例', K.exposureRatio.toFixed(1) + '%', '(預期', expected.toFixed(1) + '%)');
if (Math.abs(K.exposureRatio - expected) > 0.01) throw new Error('曝險比例算錯');
console.log('  曝險比例公式相符 ✓');
// 額度用得越多,分母越接近自己的錢,比例要往上走
const ratioBefore = K.exposureRatio;
A.state.leverage.tranches[1].useDate = '2026-02-01';
A.state.leverage.tranches[1].amount = 1000000;
const K2 = A.computeRisk();
console.log('  再動用 100 萬後,分母', Math.round(K2.capacity), '→ 曝險', K2.exposureRatio.toFixed(1) + '%',
            '(原', ratioBefore.toFixed(1) + '%)');
if (!(K2.exposureRatio > ratioBefore)) throw new Error('多借錢後曝險比例沒有升高');
console.log('  多借錢 → 比例升高 ✓');
A.state.leverage.tranches[1].useDate = '';

console.log('每月快照');
A.state.netWorthHistory = [];
if (!A.maybeSnapshot()) throw new Error('沒有建立快照');
let h = A.state.netWorthHistory[0];
console.log('  ', h.m, '淨資產', h.v, '| 部位', h.pv, '| 借款', h.loan, '| 損益', h.pnl, '| auto', h.auto);
if (h.pv !== 3000000 || h.loan !== 1000000) throw new Error('快照內容錯誤');
if (A.maybeSnapshot()) throw new Error('數值沒變卻重複寫入');
console.log('  數值沒變時不重複寫 ✓');
inst('00631L').price = 45;
if (!A.maybeSnapshot()) throw new Error('數值改變卻沒更新快照');
console.log('  股價變動後更新為', A.state.netWorthHistory[0].pv, '✓');
A.state.netWorthHistory[0].auto = false;    // 使用者手動改過
inst('00631L').price = 50;
if (A.maybeSnapshot()) throw new Error('覆寫了使用者手動改過的月份');
console.log('  手動改過的月份不被覆寫 ✓');

console.log('圖表');
const svg = A.lineChart('t1', ['1月','2月','3月'], [{ name:'損益', color:'var(--s1)', values:[-100, 50, 200] }], { zero:true });
if (!svg.includes('<svg') || !svg.includes('stroke-dasharray')) throw new Error('圖表沒畫出零線');
if (A.lineChart('t2', ['1月'], [{ name:'x', color:'var(--s1)', values:[1] }], {}) !== '') throw new Error('只有一點時應該不畫圖');
console.log('  兩點以上才畫、含零線 ✓');

console.log('equityValue(自己的錢,每日/每月快照用)不能被借來的錢或新投入的錢灌水');
(function testEquityValue(){
  A.state = A.emptyState();
  A.state.leverage.annualRate = 2.4;
  A.state.trades = [{ id:'own', date:'2025-06-01', symbol:'00631L', action:'buy',
                      shares:10000, price:100, fee:0, amount:0, source:'cash', note:'' }];
  const I = () => A.state.instruments.find(x => x.id === '00631L');
  I().price = 60;
  A.state.leverage.tranches[0].useDate = '2026-01-01';
  A.state.leverage.tranches[0].amount = 1000000;
  A.state.trades.push({ id:'lev', date:'2026-01-02', symbol:'00631L', action:'buy',
                        shares:16667, price:60, fee:0, amount:0, source:'loan', note:'' });

  let r = A.computeLeverage();
  const expectOwn = (10000 + 16667) * 60 - 1000000;   // 市值 − 借款餘額;借來的那筆市值剛好被借款餘額抵銷掉
  console.log('  剛借完:市值', Math.round(r.totalValue), '自己的錢', Math.round(r.equityValue), '(預期', expectOwn + ')');
  if (Math.abs(r.equityValue - expectOwn) > 1) throw new Error('借來的錢灌水了 equityValue');
  console.log('  借來的錢沒有灌水 ✓');

  I().price = 80;
  r = A.computeLeverage();
  const before = r.equityValue;
  console.log('  股價 80 → 自己的錢', Math.round(before));

  A.state.trades.push({ id:'sell', date:'2026-09-01', symbol:'00631L', action:'sell',
                        shares:21333, price:80, fee:0, amount:0, source:'cash', note:'' });
  r = A.computeLeverage();
  console.log('  賣掉八成後:市值', Math.round(r.totalValue), '自己的錢', Math.round(r.equityValue));
  if (Math.abs(r.equityValue - before) > 1) throw new Error('賣出不該改變自己的錢(同價賣出)');
  console.log('  同價賣出金額不變 ✓');

  // 動用之後再用薪水加碼,不能讓 equityValue 灌水
  const eq0 = A.computeLeverage().equityValue;
  A.state.trades.push({ id:'add', date:'2026-09-02', symbol:'00631L', action:'buy',
                        shares:5000, price:80, fee:0, amount:0, source:'cash', note:'薪水加碼' });
  const eq1 = A.computeLeverage().equityValue;
  console.log('  再投入 40 萬自有資金 → 自己的錢', Math.round(eq0), '→', Math.round(eq1));
  if (Math.abs(eq1 - eq0) > 1) throw new Error('新投入的自有資金灌大了「自己的錢」');
  console.log('  動用後新投入的錢不算進來 ✓');
})();

console.log('XIRR 與淨投入');
// 1) 教科書案例:投入 1000,一年後拿回 1100 → 10%
const xr1 = A.xirr([{ date:'2025-01-01', amount:-1000 }, { date:'2026-01-01', amount:1100 }]);
console.log('  1000 → 一年後 1100:', (xr1*100).toFixed(2) + '%(應為 10%)');
if (Math.abs(xr1 - 0.10) > 0.002) throw new Error('單筆一年期算錯');

// 2) 半年翻倍 → 年化 300%((1+r)^0.5 = 2 → r = 3)
const xr2 = A.xirr([{ date:'2026-01-01', amount:-1000 }, { date:'2026-07-02', amount:2000 }]);
console.log('  半年翻倍:', (xr2*100).toFixed(0) + '%(應接近 300%)');
if (Math.abs(xr2 - 3) > 0.15) throw new Error('半年期年化算錯');

// 3) 不定期加碼:後投入的錢不該被當成放了整段時間
const late = A.xirr([
  { date:'2026-01-01', amount:-1000 },
  { date:'2026-08-01', amount:-1000 },
  { date:'2026-09-01', amount:2200 }
]);
const naive = (200 / 2000) / (243/365.25) * 100;   // 總報酬率 ÷ 年數
console.log('  不定期加碼 XIRR', (late*100).toFixed(1) + '% vs 粗估年化', naive.toFixed(1) + '%');
if (Math.abs(late*100 - naive) < 1) throw new Error('XIRR 和粗估年化沒有差別,可能沒真的按日期折現');
console.log('  兩者明顯不同 → 有按實際日期折現 ✓');

// 4) 全賠光 → 接近 -100%
const xr4 = A.xirr([{ date:'2026-01-01', amount:-1000 }, { date:'2026-09-01', amount:1 }]);
console.log('  幾乎全賠:', (xr4*100).toFixed(0) + '%');
if (!(xr4 < -0.9)) throw new Error('大虧時 XIRR 不合理(得到 ' + xr4 + ')');

// 5) 沒有正負兩種流向 → 算不出來,要回 null
if (A.xirr([{ date:'2026-01-01', amount:-1000 }]) !== null) throw new Error('單筆流出應回 null');
console.log('  資料不足時回 null,不會亂給數字 ✓');

// 6) 淨投入:賣出與配息要扣回來
A.state = A.emptyState();
inst('00631L').price = 40;
A.state.trades = [
  { id:'b1', date:'2026-01-05', symbol:'00631L', action:'buy',  shares:10000, price:30, fee:0, amount:0, source:'cash', note:'' },
  { id:'s1', date:'2026-05-05', symbol:'00631L', action:'sell', shares:4000,  price:35, fee:0, amount:0, source:'cash', note:'' },
  { id:'d1', date:'2026-06-05', symbol:'00631L', action:'dividend', shares:0, price:0, fee:0, amount:8000, source:'cash', note:'' }
];
const P6 = A.computePosition();
console.log('  累計投入', P6.buyCash, '| 賣出回收', P6.sellNet, '| 配息', P6.dividends, '→ 淨投入', P6.netCash);
if (P6.netCash !== 300000 - 140000 - 8000) throw new Error('淨投入沒有把賣出與配息扣回來');
console.log('  淨投入 = 累計投入 − 賣出 − 配息 ✓');

// 7) 買賣來回不會讓分母越滾越大
A.state.trades.push(
  { id:'b2', date:'2026-07-05', symbol:'00631L', action:'buy',  shares:4000, price:36, fee:0, amount:0, source:'cash', note:'' },
  { id:'s2', date:'2026-08-05', symbol:'00631L', action:'sell', shares:4000, price:38, fee:0, amount:0, source:'cash', note:'' }
);
const P7 = A.computePosition();
console.log('  來回一趟後:累計投入', P7.buyCash, '(變大)| 淨投入', P7.netCash, '(幾乎不變)');
if (P7.buyCash <= P6.buyCash) throw new Error('累計投入應該變大');
if (Math.abs(P7.netCash - P6.netCash) > 10000) throw new Error('淨投入被來回買賣灌水了');
console.log('  來回買賣不會灌大淨投入 ✓');

// 8) 現金流有含房貸與利息
A.state.leverage.tranches[0].useDate = '2026-02-01';
A.state.leverage.tranches[0].amount = 500000;
A.state.leverage.tranches[0].repayments = [{ id:'r', date:'2026-08-01', amount:200000 }];
A.state.leverage.annualRate = 2.4;
const fl = A.cashFlows();
const hasRepay = fl.some(f => f.date === '2026-08-01' && f.amount === -200000);
const interestFlows = fl.filter(f => f.amount < 0 && Math.abs(f.amount) < 2000).length;
console.log('  現金流', fl.length, '筆 | 含還款', hasRepay, '| 每月利息', interestFlows, '筆');
if (!hasRepay) throw new Error('還款沒有進現金流');
if (interestFlows < 5) throw new Error('每月利息沒有進現金流');
if (A.balanceAt(A.state.leverage.tranches[0], '2026-07-31') !== 500000) throw new Error('還款前的餘額錯誤');
if (A.balanceAt(A.state.leverage.tranches[0], '2026-08-31') !== 300000) throw new Error('還款後的餘額錯誤');
console.log('  房貸動用、還款、每月利息都進現金流 ✓');

console.log('缺月份的走勢圖');
A.state = A.emptyState();
A.state.netWorthHistory = [
  { id:'a', m:'2026-01', v:1000, pv:100, loan:0, pnl:10, auto:true },
  { id:'b', m:'2026-06', v:2000, pv:200, loan:0, pnl:20, auto:true },
  { id:'c', m:'2026-09', v:3000, pv:300, loan:0, pnl:30, auto:true }
];
const mh = A.monthlyHistory(12);
console.log('  三筆快照(1月、6月、9月)→ 補成', mh.length, '個月:', mh.map(h => h.m.slice(5)).join(' '));
if (mh.length !== 9) throw new Error('沒有補成連續月份(得到 ' + mh.length + ')');
const filled = mh.filter(h => h.v !== null).length;
if (filled !== 3) throw new Error('補出來的月份應該是空值,實得 ' + filled);
if (mh[0].m !== '2026-01' || mh[mh.length-1].m !== '2026-09') throw new Error('頭尾月份不對');
console.log('  中間沒資料的月份留空,間隔才是真的 ✓');

console.log('本機空間不足時的處理');
A.state = A.emptyState();
const big = 'x'.repeat(200);
for (let i = 1; i <= 10; i++) localStorage.setItem('financeBackup_2026-01-' + String(i).padStart(2,'0'), big);
let cnt0 = 0;
for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf('financeBackup_') === 0) cnt0++;
console.log('  先放', cnt0, '份假備份');
// 模擬配額爆掉:setItem 對主資料鍵丟例外,直到備份被清掉
const realSet = localStorage.setItem.bind(localStorage);
let freed = 0;
localStorage.setItem = function(k, v){
  if (k === 'financeAppState_v2' && freed < 3) throw new Error('QuotaExceededError');
  return realSet(k, v);
};
const realRemove = localStorage.removeItem.bind(localStorage);
localStorage.removeItem = function(k){ if (k.indexOf('financeBackup_') === 0) freed++; return realRemove(k); };
const ok = A.writeLocal(A.state);
localStorage.setItem = realSet;
localStorage.removeItem = realRemove;
console.log('  清掉', freed, '份最舊備份後存檔成功:', ok);
if (!ok) throw new Error('空間不足時沒有靠清備份救回存檔');
console.log('  主資料存得進去,不會靜靜失敗 ✓');

console.log('只有一天資料時不該畫出空白圖');
A.state = A.emptyState();
const oneI = A.state.instruments.find(x => x.id === '00631L');
oneI.shares = 10000; oneI.price = 36.64;
A.maybeSnapshot(); A.maybeDailySnapshot();
A.currentTab = 'leverage';
A.levTab = 'overview';
A.renderAll();
const oneHtml = store.content.innerHTML;
console.log('  一天紀錄 →', (oneHtml.match(/<svg/g)||[]).length, '張圖 |',
            oneHtml.includes('累積兩天就會出現') ? '有說明在等什麼' : '沒有說明');
if ((oneHtml.match(/<svg/g)||[]).length !== 0) throw new Error('一個時間點卻畫出圖');
if (!oneHtml.includes('累積兩天就會出現')) throw new Error('沒有告訴使用者在等什麼');
// 兩天就要畫得出來
A.state.dailyHistory.push({ d:'2026-09-09', pv:400000, loan:0, eq:400000, pnl:null });
A.renderAll();
const twoHtml = store.content.innerHTML;
console.log('  兩天紀錄 →', (twoHtml.match(/<svg/g)||[]).length, '張圖');
if ((twoHtml.match(/<svg/g)||[]).length < 1) throw new Error('兩個時間點卻畫不出圖');
console.log('  一天不畫、兩天就畫 ✓');

console.log('小分頁內容不重複');
A.state = A.sampleData();
A.currentTab = 'leverage';
const seenCards = {};
['overview','signal','log','setup'].forEach(t => {
  A.levTab = t;
  A.renderAll();
  [...store.content.innerHTML.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].forEach(m => {
    const name = m[1].trim();
    if (seenCards[name] && seenCards[name] !== t)
      throw new Error('「' + name + '」同時出現在 ' + seenCards[name] + ' 和 ' + t);
    seenCards[name] = t;
  });
});
console.log('  每張卡片只屬於一個小分頁 ✓');
console.log('  概況:', Object.keys(seenCards).filter(k => seenCards[k]==='overview').join('、'));
console.log('  訊號:', Object.keys(seenCards).filter(k => seenCards[k]==='signal').join('、'));
console.log('  紀錄:', Object.keys(seenCards).filter(k => seenCards[k]==='log').join('、'));
console.log('  設定:', Object.keys(seenCards).filter(k => seenCards[k]==='setup').join('、'));
A.levTab = 'overview';

console.log('槓桿頁小分頁固定');
A.state = A.sampleData();
A.currentTab = 'leverage';
['overview','signal','log','setup'].forEach(t => {
  A.levTab = t;
  A.renderAll();
  const h = store.content.innerHTML;
  if (!h.includes('class="subtabs"')) throw new Error(t + ' 分頁沒有固定式切換列');
  if (h.indexOf('class="subtabs"') > 200) throw new Error(t + ' 的切換列不在最前面');
});
console.log('  四個小分頁都有固定式切換列,且位於內容最上方 ✓');
A.levTab = 'overview';

console.log('從紀錄分頁記還款');
A.state = A.emptyState();
A.state.leverage.tranches[0].useDate = '2026-01-01';
A.state.leverage.tranches[0].amount = 1000000;
A.currentTab = 'leverage'; A.levTab = 'log';
A.renderAll();
const logHtml = store.content.innerHTML;
if (!logHtml.includes('記一筆還款')) throw new Error('紀錄分頁沒有還款表單');
A.onField('rd-amount', { value:'250000' });
A.onClick({ dataset:{ act:'add-repay2' } });
const rp = A.state.leverage.tranches[0].repayments;
console.log('  記了', rp.length, '筆還款,金額', rp[0] && rp[0].amount, '| 餘額', A.outstanding(A.state.leverage.tranches[0]));
if (!rp.length || rp[0].amount !== 250000) throw new Error('還款沒有記進去');
if (A.outstanding(A.state.leverage.tranches[0]) !== 750000) throw new Error('餘額沒有跟著減');
console.log('  餘額跟著減 ✓');
A.levTab = 'overview';

console.log('每日走勢');
A.state = A.emptyState();
const dI = A.state.instruments.find(x => x.id === '00631L');
dI.price = 40; dI.shares = 10000;
if (!A.maybeDailySnapshot()) throw new Error('第一次沒有記錄');
console.log('  今天記一筆:市值', A.state.dailyHistory[0].pv);
if (A.state.dailyHistory.length !== 1) throw new Error('筆數不對');
if (A.maybeDailySnapshot()) throw new Error('數值沒變卻重複寫入');
console.log('  數值沒變不重複寫 ✓');
dI.price = 44;
if (!A.maybeDailySnapshot()) throw new Error('股價變了卻沒更新');
if (A.state.dailyHistory.length !== 1) throw new Error('同一天應該更新不是新增');
console.log('  同一天更新到最新:', A.state.dailyHistory[0].pv, '(仍是 1 筆)✓');

// 塞 1200 天,檢查上限
A.state.dailyHistory = [];
for (let i = 0; i < 1200; i++){
  const d = new Date(2023, 0, 1 + i);
  A.state.dailyHistory.push({ d: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0'), pv: 100000 + i, loan: 0, eq: 100000 + i, pnl: i });
}
dI.price = 99;
A.maybeDailySnapshot();
console.log('  塞 1200 筆後保留', A.state.dailyHistory.length, '筆(上限 1000)');
if (A.state.dailyHistory.length > 1000) throw new Error('沒有裁掉過舊的每日紀錄');

A.chartRange = 30;
console.log('  範圍 1 個月 →', A.dailySlice().length, '筆 | 全部 →', (A.chartRange = 0, A.dailySlice().length), '筆');
A.chartRange = 30;
if (A.dailySlice().length !== 30) throw new Error('範圍選擇沒生效');
A.chartRange = 90;

A.currentTab = 'leverage';
A.levTab = 'overview';
A.renderAll();
const dhtml = store.content.innerHTML;
if (!dhtml.includes('data-act="range"')) throw new Error('沒有出現範圍切換');
console.log('  槓桿頁出現範圍切換鈕 ✓');

console.log('圖表互動');
A.state = A.sampleData();
A.currentTab = 'leverage';
A.levTab = 'overview';
A.renderAll();
const cd = A.chartData['pos'];
if (!cd) throw new Error('圖表資料沒有登記');
console.log('  部位圖', cd.labels.length, '個月 |', cd.series.map(x => x.name).join('、'));
const capLast = A.chartCaption('pos', cd.labels.length - 1);
const capFirst = A.chartCaption('pos', 0);
console.log('  最後一點:', capLast.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 56));
if (capFirst === capLast) throw new Error('不同月份的說明列應該不一樣');
if (capLast.indexOf(cd.labels[cd.labels.length - 1]) < 0) throw new Error('說明列沒有標月份');
const chartHtml = store.content.innerHTML;
const hits = (chartHtml.match(/data-act="chart"/g) || []).length;
console.log('  可點區域', hits, '個 ✓');
if (!hits) throw new Error('圖上沒有可點的區域');

console.log('匯出 CSV');
A.state.transactions.push({ id:'q', date:'2026-09-09', cat:'測試', desc:'含,逗號與" 引號', amount:-100 });
const csv = A.stateCSV();
if (csv.charCodeAt(0) !== 0xFEFF) throw new Error('缺少 BOM,Excel 會亂碼');
const sections = csv.slice(1).split('\n').filter(l => l.charAt(0) === '#');   // 去掉開頭的 BOM
console.log('  區段:', sections.join(' '));
['# 交易紀錄', '# 買賣紀錄', '# 持股', '# 資產', '# 每月快照', '# 目前損益'].forEach(x => {
  if (sections.indexOf(x) < 0) throw new Error('少了區段 ' + x);
});
const line = csv.split('\n').filter(l => l.indexOf('逗號') >= 0)[0];
console.log('  跳脫後:', line);
const q = String.fromCharCode(34);
if (line.indexOf(q + '含,逗號與' + q + q) < 0) throw new Error('CSV 沒有正確跳脫逗號與引號');
console.log('  逗號與引號跳脫正確 ✓');

console.log('還款紀錄');
(function testRepay(){
  A.state = A.emptyState();
  A.state.leverage.annualRate = 2.4;
  const T = A.state.leverage.tranches[0];
  T.amount = 1000000;
  T.useDate = '2026-01-01';
  T.repayments = [];

  // 跟 app 一樣用「今天零點」算,否則跑到一半跨過半天就會對不上
  const nDays = (new Date(A.todayISO() + 'T00:00:00') - new Date('2026-01-01T00:00:00')) / 86400000;
  const full = A.accrue(T, 2.4);
  const expectFull = 1000000 * 0.024 * (nDays / 365.25);
  console.log('  借滿', nDays, '天 → 利息', Math.round(full), '(預期', Math.round(expectFull) + ')');
  if (Math.abs(full - expectFull) > 1) throw new Error('未還款時的利息算錯');
  if (A.outstanding(T) !== 1000000) throw new Error('餘額錯誤');

  T.repayments = [{ id:'r1', date:'2026-05-01', amount:500000 }];
  const partial = A.accrue(T, 2.4);
  console.log('  5/1 還 50 萬 → 利息', Math.round(partial), '| 餘額', A.outstanding(T));
  if (A.outstanding(T) !== 500000) throw new Error('還款後餘額沒扣');
  const seg1 = (new Date('2026-05-01') - new Date('2026-01-01')) / 86400000;
  const seg2 = nDays - seg1;
  const manual = 1000000 * 0.024 * (seg1 / 365.25) + 500000 * 0.024 * (seg2 / 365.25);
  console.log('  手算分段', Math.round(manual), '→ 相符', Math.abs(partial - manual) < 1);
  if (Math.abs(partial - manual) > 1) throw new Error('分段利息與手算不符');
  if (!(partial < full)) throw new Error('還款後利息沒有變少');

  // 全部還清
  T.repayments = [{ id:'r1', date:'2026-05-01', amount:1000000 }];
  inst('00631L').price = 100;
  inst('00631L').shares = 100000;
  const RL = A.computeLeverage();
  console.log('  全部還清 → 餘額', RL.usedAmount, '| 月息', Math.round(RL.monthlyInterest));
  if (RL.usedAmount !== 0) throw new Error('還清後餘額不是 0');
  if (RL.monthlyInterest !== 0) throw new Error('還清後還在算月息');
  if (RL.drawnAmount !== 1000000) throw new Error('累計動用的歷史被清掉了');
  console.log('  還清後不計息、動用歷史保留 ✓');
})();

console.log('配息');
A.state = A.emptyState();
inst('00631L').price = 40;
A.state.trades = [
  { id:'d1', date:'2026-01-05', symbol:'00631L', action:'buy', shares:10000, price:30, fee:428, source:'cash', amount:0, note:'' },
  { id:'d2', date:'2026-07-20', symbol:'00631L', action:'dividend', shares:0, price:0, amount:12000, fee:0, source:'cash', note:'' }
];
let PD = A.computePosition();
console.log('  配息', Math.round(PD.dividends), '| 已實現', Math.round(PD.realized), '| 持股', A.heldShares('00631L'));
if (PD.dividends !== 12000) throw new Error('配息沒計入');
if (PD.realized !== 12000) throw new Error('配息沒進已實現損益');
if (A.heldShares('00631L') !== 10000) throw new Error('配息不該影響股數');
console.log('  配息計入已實現、不影響股數 ✓');

console.log('自訂標的');
A.state.instruments.push({ id:'0050', name:'元大台灣50', leverage:1, price:200, shares:0, auto:true });
A.state.trades.push({ id:'d3', date:'2026-02-01', symbol:'0050', action:'buy', shares:1000, price:180, fee:257, source:'cash', amount:0, note:'' });
let RK = A.computeRisk();
// 00631L: 10000×40 = 400,000(槓桿2)、0050: 1000×200 = 200,000(槓桿1)
console.log('  部位市值', Math.round(RK.pv), '| 實質曝險', Math.round(RK.exposure));
if (Math.round(RK.pv) !== 600000) throw new Error('多標的市值加總錯誤');
if (Math.round(RK.exposure) !== 400000*2 + 200000*1) throw new Error('各標的沒用自己的槓桿倍數');
console.log('  正2 算 ×2、0050 算 ×1 ✓');

console.log('壓力測試');
A.state.leverage.creditLimit = 5000000;
let ST = A.computeStress(10);   // 大盤跌 10%,目前沒有借款(loan=0)
console.log('  部位', Math.round(ST.pv), '→', Math.round(ST.newPv), '| 曝險比例', ST.ratio.toFixed(2) + '%', '→', ST.newRatio.toFixed(2) + '%');
// 00631L 槓桿2 → 跌20% → 400000×0.8 = 320000;0050 槓桿1 → 跌10% → 180000
if (Math.round(ST.newPv) !== 320000 + 180000) throw new Error('各標的沒依自己的槓桿倍數換算');
console.log('  正2 跌兩倍、一般股跌一倍 ✓');
// 沒有借款時,分母(部位淨值+房貸總額度)裡的房貸總額度不會跟著縮水,
// 部位下跌反而讓分母縮得比分子慢,曝險比例是降的,不是升的——
// 曝險比例 = 100萬/560萬=17.86% → 82萬/550萬=14.91%
const expRatio = 1000000/5600000*100, expNewRatio = 820000/5500000*100;
if (Math.abs(ST.ratio - expRatio) > 0.01 || Math.abs(ST.newRatio - expNewRatio) > 0.01)
  throw new Error('曝險比例算錯,預期 ' + expRatio.toFixed(2) + '% → ' + expNewRatio.toFixed(2) + '%');
console.log('  沒有借款時,下跌後曝險比例反而下降(分母的額度沒縮水)✓');

console.log('記帳類別');
A.state = A.emptyState();
const cs = A.knownCats();
console.log('  預設類別', cs.slice(0, 3), '…共', cs.length, '個');
if (!cs.includes('餐飲')) throw new Error('預算類別沒進下拉清單');
A.state.budgets = [];
A.state.transactions = [{ id:'x', date:'2026-09-01', cat:'加油', desc:'', amount:-500 }];
if (!A.knownCats().includes('加油')) throw new Error('既有交易的類別沒進清單');
console.log('  預算類別 + 既有交易類別都在清單裡 ✓');

console.log('利息自動入帳');
A.state = A.sampleData();
A.viewMonth = A.thisMonth();
A.state.leverage.tranches[0].useDate = '2026-01-01';
A.state.leverage.interestPosted = [];
const before = A.state.transactions.length;
A.maybePostInterest();
const added = A.state.transactions.filter(t => t.cat === '房貸利息');
console.log('  新增', A.state.transactions.length - before, '筆 |', added.length ? added[0].desc + ' ' + added[0].amount : '(無)');
if (added.length !== 1) throw new Error('利息沒有入帳');
A.maybePostInterest();
if (A.state.transactions.filter(t => t.cat === '房貸利息').length !== 1) throw new Error('同一個月重複入帳');
console.log('  重複呼叫不會重覆記帳 ✓');
A.state.transactions = A.state.transactions.filter(t => t.cat !== '房貸利息');
A.maybePostInterest();
if (A.state.transactions.some(t => t.cat === '房貸利息')) throw new Error('刪掉後又被補記');
console.log('  刪掉後不會被補記 ✓');
A.state.leverage.autoInterest = false;
A.state.leverage.interestPosted = [];
A.maybePostInterest();
if (A.state.transactions.some(t => t.cat === '房貸利息')) throw new Error('關閉後仍入帳');
console.log('  關閉開關後不入帳 ✓');

console.log('清空');
A.onClick({ dataset:{ act:'clear-all' } });
console.log('  第一次 → pendingConfirm =', A.pendingConfirm, '| 資產數', A.state.assets.length);
A.onClick({ dataset:{ act:'clear-all' } });
console.log('  第二次 → 資產數', A.state.assets.length, '| 交易數', A.state.transactions.length);
pass('after-clear');

// 非同步的放最後,避免和同步段落交錯
(async () => {
  console.log('每日備份與還原');
  A.state = A.sampleData();
  const expected = { assets: A.state.assets.length, tx: A.state.transactions.length };
  const api = A.localBackupApi();
  const day = new Date().toISOString().slice(0, 10);

  await api.put(day, JSON.parse(JSON.stringify(A.state)));
  const ids = await api.list();
  console.log('  備份清單', ids);
  if (!ids.includes(day)) throw new Error('備份沒存成功');

  A.state.assets = [];              // 模擬誤刪
  A.state.transactions = [];
  await A.restoreBackup(day);
  console.log('  還原後資產', A.state.assets.length, '筆 / 交易', A.state.transactions.length, '筆',
              '(原本', expected.assets, '/', expected.tx + ')');
  if (A.state.assets.length !== expected.assets || A.state.transactions.length !== expected.tx){
    throw new Error('還原後的內容對不上');
  }
  console.log('  還原成功 ✓');

  // 只保留 30 天
  for (let i = 1; i <= 35; i++){
    await api.put('2026-08-' + String(i).padStart(2, '0'), { version: 2 });
  }
  await A.maybeBackup();
  const after = await api.list();
  console.log('  寫入 36 份後,保留', after.length, '份(上限 30)');
  if (after.length > 30) throw new Error('沒有清掉過期備份');

  console.log('\nALL OK');
})();
