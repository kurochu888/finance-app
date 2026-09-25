const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', scrollTop:0, style:{}, dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html','utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A = {
  get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v}, set levTab(v){levTab=v}, set chartRange(v){chartRange=v},
  renderAll, sampleData, emptyState, normalize, onClick, onField, computeLeverage,
  computePosition, computeRisk, heldShares, findInstrument, accrue, outstanding, netWorth,
  cashFlows, accruedInterest, stateCSV, renderTrades, fetchQuotes, computeStress, maybePostInterest, todayISO, renderExposurePlanCard,
  get tradeDraft(){return tradeDraft}, get tradeError(){return tradeError}, get quoteBusy(){return quoteBusy||backfillBusy}
};`);

const draw = i => {
  while (A.state.leverage.draws.length <= i)
    A.state.leverage.draws.push({ id:'d'+A.state.leverage.draws.length, label:'動用記錄', amount:0, useDate:'', note:'', repayments:[] });
  return A.state.leverage.draws[i];
};
const bugs = [];
const check = (name, fn) => {
  try { const msg = fn(); if (msg) bugs.push(name + ' → ' + msg); }
  catch(e){ bugs.push(name + ' → 例外:' + e.message); }
};

check('新增兩個空白標的', () => {
  A.state = A.emptyState();
  A.onClick({ dataset:{ act:'add-instrument' } });
  A.onClick({ dataset:{ act:'add-instrument' } });
  const blanks = A.state.instruments.filter(x => x.id === '');
  if (blanks.length !== 2) return '沒有建立兩列(' + blanks.length + ')';
  // 兩列的 data-k 都是 in-id-,改一列會改到另一列
  A.onField('in-name-', { value:'測試A' });
  if (blanks[0].name === blanks[1].name && blanks[1].name !== '') return '兩列共用同一個 key,編輯會互相影響';
  return '';
});

check('空白標的存檔後 id 被亂數化', () => {
  A.state = A.emptyState();
  A.state.instruments.push({ id:'', name:'待填', leverage:1, price:0, shares:0, auto:true });
  const round = A.normalize(JSON.parse(JSON.stringify(A.state)));
  const it = round.instruments.find(x => x.name === '待填');
  if (it && it.id && it.id.length > 0) return 'id 從空白變成亂數 "' + it.id + '"';
  return '';
});

check('重複代號重複計算市值', () => {
  A.state = A.emptyState();
  A.state.instruments = [
    { id:'0050', name:'A', leverage:1, price:100, shares:0, auto:true },
    { id:'0050', name:'B(重複)', leverage:1, price:100, shares:0, auto:true }
  ];
  A.state.trades = [{ id:'t', date:'2026-01-01', symbol:'0050', action:'buy', shares:1000, price:100, fee:0, amount:0, source:'cash', note:'' }];
  const tv = A.computeLeverage().totalValue;
  if (tv !== 100000) return '市值 ' + tv + ',應為 100,000(被重複計算)';
  return '';
});

check('刪掉還有買賣紀錄的標的', () => {
  A.state = A.emptyState();
  A.state.instruments = [{ id:'0050', name:'A', leverage:1, price:100, shares:0, auto:true }];
  A.state.trades = [{ id:'t', date:'2026-01-01', symbol:'0050', action:'buy', shares:1000, price:100, fee:0, amount:0, source:'cash', note:'' }];
  A.onClick({ dataset:{ act:'del-instrument', id:'0050' } });
  const p = A.computePosition();
  if (A.state.trades.length && p.marketValue === 0 && p.remainCost > 0)
    return '標的被刪掉但買賣紀錄還在,市值歸零、成本還在 → 帳面憑空虧損 ' + Math.round(p.unrealized);
  return '';
});

check('賣超過持股', () => {
  A.state = A.emptyState();
  A.state.instruments = [{ id:'0050', name:'A', leverage:1, price:100, shares:0, auto:true }];
  A.state.trades = [
    { id:'b', date:'2026-01-01', symbol:'0050', action:'buy',  shares:1000, price:100, fee:0, amount:0, source:'cash', note:'' },
    { id:'s', date:'2026-02-01', symbol:'0050', action:'sell', shares:5000, price:100, fee:0, amount:0, source:'cash', note:'' }
  ];
  const p = A.computePosition();
  if (Math.abs(p.realized) > 1) return '賣超過持股,已實現損益變成 ' + Math.round(p.realized) + '(多賣的部分被當成獲利)';
  return '';
});

check('還款日期填在未來', () => {
  A.state = A.emptyState();
  const T = draw(0);
  T.amount = 1000000; T.useDate = '2026-01-01';
  T.repayments = [{ id:'r', date:'2099-01-01', amount:1000000 }];
  const bal = A.outstanding(T);
  const int = A.accrue(T, 2.4);
  if (bal === 0 && int > 0) return '餘額立刻歸零(' + bal + ')但利息還在累積(' + Math.round(int) + '),兩邊不一致';
  return '';
});

check('還款超過動用金額', () => {
  A.state = A.emptyState();
  const T = draw(0);
  T.amount = 1000000; T.useDate = '2026-01-01';
  T.repayments = [{ id:'r', date:'2026-02-01', amount:3000000 }];
  const bal = A.outstanding(T);
  if (bal !== 0) return '餘額 ' + bal;
  return '';
});

check('XIRR 現金流裡的利息加總要等於「借款利息」(月中動用、當月未過完都不能算成整個月)', () => {
  A.state = A.sampleData();
  // 範例資料「今天結清的價值」(市值 − 借款)是正的,所以負的現金流只有買進跟利息;扣掉買進那幾天就是利息
  const tradeDates = new Set(A.state.trades.map(t => t.date));
  const paid = -A.cashFlows(false).filter(f => f.amount < 0 && !tradeDates.has(f.date)).reduce((a, f) => a + f.amount, 0);
  const accrued = A.accruedInterest();
  if (!(accrued > 0)) return '範例資料應該有借款利息';
  if (Math.abs(paid - accrued) > 0.01) return `XIRR 利息 ${paid.toFixed(2)} ≠ 借款利息 ${accrued.toFixed(2)}`;
  return '';
});

check('匯入/雲端資料的 id 帶 HTML 不能原樣進 state(會被塞進 data-id 屬性執行程式)', () => {
  const evil = 'x"><img src=x onerror=alert(1)>';
  const s = A.normalize({ assets:[{ id:evil, name:'a', amount:1 }], liabilities:[{ id:evil, name:'l', amount:1 }],
    trades:[{ id:evil, date:'2026-01-01', symbol:'00631L', shares:1, price:1 }], transactions:[{ id:evil, date:'2026-01-01', amount:-1 }],
    netWorthHistory:[{ id:evil, m:'2026-01', v:1, items:[{ id:evil, name:'x', amount:1 }] }],
    instruments:[{ key:evil, id:'00631L', leverage:2 }],
    leverage:{ draws:[{ id:evil, amount:1, useDate:'2026-01-01', repayments:[{ id:evil, date:'2026-01-02', amount:1 }] }] } });
  const ids = [...s.assets, ...s.liabilities, ...s.trades, ...s.transactions, ...s.netWorthHistory, ...s.netWorthHistory[0].items,
    ...s.leverage.draws, ...s.leverage.draws[0].repayments].map(x => x.id).concat(s.instruments.map(x => x.key));
  const bad = ids.filter(id => !/^[A-Za-z0-9_-]+$/.test(id));
  if (bad.length) return '還有不安全的 id:' + bad.join(', ');
  const ok = A.normalize({ assets:[{ id:'abc123', name:'a', amount:1 }], leverage:{ draws:[{ id:'core', amount:1 }] } });
  if (ok.assets[0].id !== 'abc123' || ok.leverage.draws[0].id !== 'core') return '正常的 id 不能被改掉';
  return '';
});

check('壞掉的日期(匯入/同步來的)要換成合法日期,不能讓月份算出 NaN', () => {
  const s = A.normalize({ transactions:[{ id:'t1', date:'<b>x</b>', amount:-1 }, { id:'t2', date:'2026-02-30', amount:-1 }, { id:'t3', date:'2024-02-29', amount:-1 }],
    trades:[{ id:'p1', date:'garbage', symbol:'00631L', shares:1, price:1 }],
    leverage:{ draws:[{ id:'d1', amount:1, useDate:'2026-13-01', repayments:[{ id:'r1', date:'nope', amount:1 }] }] } });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(s.transactions[0].date) || !re.test(s.transactions[1].date)) return '壞日期沒有被換掉:' + s.transactions.map(t => t.date).join(',');
  if (s.transactions[1].date === '2026-02-30') return '2 月 30 日不該被接受';
  if (s.transactions[2].date !== '2024-02-29') return '閏年 2/29 是合法日期,不該被換掉';
  if (!re.test(s.trades[0].date)) return '買賣紀錄的壞日期沒被換掉';
  if (s.leverage.draws[0].useDate !== '' || s.leverage.draws[0].repayments[0].date !== '') return '動用/還款的壞日期應該清成空白';
  return '';
});

check('損益快取不能用到過期結果(改買賣日期的月份、改股價、改利率都要重算)', () => {
  A.state = A.sampleData();
  const before = A.computePosition();
  const t = A.state.trades.find(x => x.source !== 'loan');   // 自有資金買的才算自己的現金流,日期才會影響 XIRR
  t.date = t.date.slice(0, 5) + String(Math.max(1, Number(t.date.slice(5, 7)) - 1)).padStart(2, '0') + t.date.slice(7);   // 只改月份
  const afterDate = A.computePosition();
  if (afterDate === before || afterDate.xirr === before.xirr) return '改了買賣日期的月份,損益/XIRR 卻沒有重算';
  A.state.instruments[0].price *= 1.1;
  if (A.computePosition() === afterDate) return '改了股價,損益卻沒有重算';
  const p1 = A.computePosition();
  A.state.leverage.annualRate += 1;
  if (A.computePosition() === p1) return '改了利率,損益卻沒有重算';
  return '';
});

check('CSV:公式注入要擋、逗號/引號/換行(含 \\r)要正確加引號、負數金額照常、每月細項有匯出', () => {
  A.state = A.sampleData();
  A.state.transactions = [
    { id:'c1', date:'2026-09-01', cat:'=HYPERLINK("http://x","點我")', desc:'+1+1', amount:-100 },
    { id:'c2', date:'2026-09-02', cat:'餐飲', desc:'a,b "c"\r\nd', amount:-200 },
    { id:'c3', date:'2026-09-03', cat:'@SUM(A1)', desc:'-5% 折扣', amount:300 },
  ];
  A.state.netWorthHistory[A.state.netWorthHistory.length - 1].items = [{ id:'a1', name:'活存', amount:1234, t:'a' }];
  const csv = A.stateCSV();
  if (/(^|,)[=+@]/m.test(csv.replace(/"[^"]*"/g, '""'))) return 'CSV 裡還有以 = + @ 開頭的儲存格(Excel 會當公式)';
  if (!csv.includes(`"'=HYPERLINK(""http://x"",""點我"")"`)) return '公式開頭的類別沒有被加上 \' 跟正確跳脫';
  if (!csv.includes(`"a,b ""c""\r\nd"`)) return '含逗號/引號/\\r\\n 的說明沒有正確加引號';
  if (!csv.includes(",-200")) return '負數金額不該被加上 \'';
  if (!csv.includes('# 每月資產負債細項') || !csv.includes(',資產,活存,1234')) return '每月細項沒有匯出';
  return '';
});

check('舊格式備份(tranches + core)要正確轉成動用清單,id 也要檢查', () => {
  const legacy = { assets:[], leverage:{ creditLimit: 5000000, annualRate: 2.5,
    tranches:[
      { useDate:'2022-03-01', amount:1000000, repayments:[{ id:'r1', date:'2023-01-01', amount:200000 }] },
      { useDate:'', amount:0 },                                       // 沒動用過的空桶,轉換時捨棄
      { id:'x"><img src=x onerror=alert(1)>', useDate:'2022-06-01', amount:500000 }
    ],
    core:{ useDate:'2021-01-15', amount:3000000, repayments:[] } } };
  const s = A.normalize(legacy);
  const d = s.leverage.draws;
  if (d.length !== 3) return `應該轉出 3 筆動用(空桶捨棄),得到 ${d.length}`;
  if (d[0].id !== 't1' || d[0].amount !== 1000000 || d[0].repayments.length !== 1) return '第一桶沒有正確轉換:' + JSON.stringify(d[0]);
  if (!d.some(x => x.id === 'core' && x.amount === 3000000)) return 'core 沒有轉成 id=core 的動用記錄';
  if (d.some(x => !/^[A-Za-z0-9_-]+$/.test(x.id))) return '舊格式的 id 沒有經過安全檢查:' + d.map(x => x.id).join(',');
  const again = A.normalize(JSON.parse(JSON.stringify(legacy)));
  if (again.leverage.draws.filter(x => x.id === 't1' || x.id === 'core').length !== 2) return '同一份舊資料重複轉換,正常的 id 應該固定不變';
  const n2 = A.normalize(JSON.parse(JSON.stringify(s)));
  if (JSON.stringify(n2.leverage.draws) !== JSON.stringify(s.leverage.draws)) return '轉換後再 normalize 一次,動用記錄不該再變';
  return '';
});

check('還款驗證:早於動用日、超過尚欠要擋下;成交價空白用目前股價', () => {
  A.state = A.sampleData();
  const d = A.state.leverage.draws[0];
  const before = (d.repayments || []).length;
  const tryRepay = (date, amount) => { A.onField('rd-target', { value: d.id }); A.onField('rd-date', { value: date }); A.onField('rd-amount', { value: String(amount) }); A.onClick({ dataset: { act: 'add-repay2' } }); };
  const early = new Date(d.useDate + 'T00:00:00'); early.setDate(early.getDate() - 3);
  const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  tryRepay(iso(early), 1000);
  if ((d.repayments || []).length !== before) return '早於動用日的還款應該被擋下(不然會被默默忽略)';
  tryRepay(d.useDate, d.amount * 10);
  if ((d.repayments || []).length !== before) return '超過尚欠的還款應該被擋下';
  tryRepay(d.useDate, 1000);
  if ((d.repayments || []).length !== before + 1) return '正常的還款應該記得進去';
  // 成交價空白 → 用目前股價
  const n = A.state.trades.length;
  A.onField('pd-action', { value: 'buy' }); A.onField('pd-shares', { value: '1000' }); A.onField('pd-price', { value: '' });
  A.onClick({ dataset: { act: 'add-trade' } });
  if (A.state.trades.length !== n + 1) return '成交價空白時應該用目前股價記進去';
  const t = A.state.trades[A.state.trades.length - 1];
  if (t.price !== A.findInstrument(t.symbol).price) return `成交價應該等於目前股價,得到 ${t.price}`;
  return '';
});

check('設定欄位填 0/空白:當下跟重新整理後要一致(不能當下照 0 算、重整又變回預設)', () => {
  A.state = A.sampleData();
  const before = A.state.leverage.exposureTargets.hold;
  A.onField('expo-hold', { value: '0' });
  const now = A.state.leverage.exposureTargets.hold;
  const reloaded = A.normalize(JSON.parse(JSON.stringify(A.state))).leverage.exposureTargets.hold;
  if (now !== reloaded) return `曝險目標填 0:當下是 ${now}、重新整理後是 ${reloaded}`;
  if (now !== before) return '曝險目標填 0 應該保留原值';
  A.onField('expo-hold', { value: '110' });
  if (A.state.leverage.exposureTargets.hold !== 110) return '正常的數字要收';
  const it = A.state.instruments[0];
  A.onField('sig-exitBuffer-' + it.key, { value: '0' });
  const eb = it.trend.exitBuffer;
  if (A.normalize(JSON.parse(JSON.stringify(A.state))).instruments[0].trend.exitBuffer !== eb) return '出場緩衝填 0:當下跟重新整理後不一致';
  return '';
});

check('資料完整往返(normalize 不掉東西)', () => {
  A.state = A.sampleData();
  A.state.leverage.draws[0].repayments = [{ id:'r1', date:'2026-08-20', amount:200000 }];
  A.state.trades.push({ id:'dv', date:'2026-08-25', symbol:'00631L', action:'dividend', shares:0, price:0, amount:5000, fee:0, source:'cash', note:'配息' });
  const before = JSON.stringify(A.state);
  const after = JSON.stringify(A.normalize(JSON.parse(before)));
  if (before !== after){
    const b = JSON.parse(before), a = JSON.parse(after);
    const diff = Object.keys(b).filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    return '往返後不同的欄位:' + diff.join(', ');
  }
  return '';
});

check('負數股價 / 負數股數(走實際輸入路徑)', () => {
  A.state = A.emptyState();
  const it = A.state.instruments[0];
  A.onField('in-price-' + it.key, { value:'-50' });
  A.onField('in-shares-' + it.key, { value:'-100' });
  if (it.price < 0 || it.shares < 0) return '輸入負數沒有被擋(price=' + it.price + ', shares=' + it.shares + ')';
  const loaded = A.normalize({ instruments:[{ key:'k', id:'X', leverage:1, price:-50, shares:-100 }] });
  if (loaded.instruments[0].price < 0) return '載入負數資料沒有被夾成 0';
  return '';
});

check('編輯既有買賣紀錄填負數', () => {
  A.state = A.emptyState();
  A.state.trades = [{ id:'t1', date:'2026-01-01', symbol:'00631L', action:'buy', shares:100, price:30, fee:20, amount:0, source:'cash', note:'' }];
  A.onField('pt-shares-t1', { value:'-500' });
  if (A.state.trades[0].shares < 0) return '股數被改成負數 ' + A.state.trades[0].shares;
  return '';
});

check('標的重新命名成已存在的代號', () => {
  A.state = A.emptyState();
  const a = A.state.instruments[0], b = A.state.instruments[1];
  A.onField('in-id-' + b.key, { value: a.id });
  if (b.id === a.id) return '兩列代號變成一樣(' + a.id + ')';
  return '';
});

check('刪掉沒有紀錄的標的', () => {
  A.state = A.emptyState();
  const before = A.state.instruments.length;
  A.onClick({ dataset:{ act:'del-instrument', id: A.state.instruments[0].key } });
  if (A.state.instruments.length !== before - 1) return '刪不掉(還有 ' + A.state.instruments.length + ' 列)';
  return '';
});

check('配息紀錄要能改金額(以前編輯只給股數/成交價,改了也不影響配息)', () => {
  A.state = A.emptyState();
  A.state.trades = [{ id:'t1', date:'2026-01-01', symbol:'00631L', action:'dividend', shares:0, price:0, fee:0, amount:1000, source:'cash', note:'' }];
  A.onClick({ dataset:{ act:'edit-trade', id:'t1' } });
  const html = A.renderTrades();
  if (!html.includes('data-k="pt-amount-t1"')) return '編輯畫面沒有配息金額欄位';
  if (html.includes('data-k="pt-shares-t1"')) return '配息的編輯畫面還在顯示股數';
  A.onField('pt-amount-t1', { value:'1200' });
  if (A.state.trades[0].amount !== 1200) return '改了配息金額沒存進去(' + A.state.trades[0].amount + ')';
  A.onClick({ dataset:{ act:'close-trade' } });
  return '';
});

check('預設標的刪掉後記一筆買賣:選單畫面上是第一檔,要記得進去', () => {
  A.state = A.emptyState();
  A.onClick({ dataset:{ act:'del-instrument', id: A.state.instruments[0].key } });
  const shown = A.state.instruments[0].id;
  A.renderTrades();
  A.tradeDraft.action = 'buy'; A.tradeDraft.shares = '100'; A.tradeDraft.price = '20';
  A.onClick({ dataset:{ act:'add-trade' } });
  if (A.tradeError) return '被擋下來:' + A.tradeError;
  if (!A.state.trades.length || A.state.trades[0].symbol !== shown) return '記到的標的不對:' + JSON.stringify(A.state.trades.map(t => t.symbol));
  return '';
});

check('兩列同代號:壓力測試、CSV 持股不能把同一批持股算兩次,重複列要刪得掉', () => {
  A.state = A.normalize({ instruments:[{ key:'a', id:'00631L', leverage:2, price:100 }, { key:'b', id:'00631L', leverage:2, price:100 }],
    trades:[{ id:'t', date:'2026-01-01', symbol:'00631L', action:'buy', shares:1000, price:90, fee:0, source:'cash' }] });
  const st = A.computeStress(20);
  if (Math.round(st.newPv) !== 60000) return '跌 20%(2 倍)後市值應該是 60000,實際 ' + st.newPv + '(loss ' + st.loss + ')';
  const csv = A.stateCSV();
  const rows = csv.split('# 持股')[1].split('\n\n')[0].split('\n').filter(l => l.startsWith('00631L'));
  const total = rows.reduce((s, l) => s + Number(l.split(',')[5]), 0);
  if (total !== 100000) return 'CSV 持股市值加總 ' + total + ',應該是 100000';
  A.onClick({ dataset:{ act:'del-instrument', id:'b' } });
  if (A.state.instruments.length !== 1) return '重複的那列刪不掉';
  A.onClick({ dataset:{ act:'del-instrument', id:'a' } });
  if (A.state.instruments.length !== 1) return '最後一列還有買賣紀錄,不該被刪掉';
  return '';
});

check('動用日期填未來:到那天才算借款,當月不能先記一筆利息', () => {
  A.state = A.emptyState();
  const future = String(Number(A.todayISO().slice(0, 4)) + 1) + '-01-15';
  A.state.leverage.draws = [{ id:'d1', label:'預定', amount:1000000, useDate: future, note:'', repayments:[] }];
  A.state.leverage.interestPosted = [];
  const r = A.computeLeverage();
  if (r.usedAmount !== 0) return '還沒到動用日,借款餘額就是 ' + r.usedAmount;
  A.maybePostInterest();
  const posted = A.state.transactions.filter(t => t.cat === '房貸利息');
  if (posted.length) return '錢還沒借就記了利息 ' + posted.map(t => t.date + ' ' + t.amount).join('、');
  return '';
});

check('先記了一筆超賣、之後才買:持股、市值、報酬率要跟損益一致', () => {
  A.state = A.normalize({ instruments:[{ key:'a', id:'00631L', leverage:2, price:25 }], trades:[
    { id:'s', date:'2025-01-05', symbol:'00631L', action:'sell', shares:100, price:20, fee:0, source:'cash' },
    { id:'b', date:'2025-06-05', symbol:'00631L', action:'buy', shares:100, price:20, fee:0, source:'cash' }] });
  const p = A.computePosition(), r = A.computeLeverage();
  if (A.heldShares('00631L') !== 100) return '持股應該是 100(超賣那筆不算),實際 ' + A.heldShares('00631L');
  if (Math.abs(r.totalValue - p.marketValue) > 1e-6) return '市值兩邊不一致:' + r.totalValue + ' vs ' + p.marketValue;
  if (p.xirr === null || !(p.xirr > 0)) return '報酬率應該是正的(買 2000 現值 2500),實際 ' + p.xirr;
  return '';
});

check('匯入的快照帶極端數字(1e308):走勢圖座標不能變 NaN', () => {
  A.state = A.normalize({ assets:[{ id:'a', name:'x', amount:5 }],
    netWorthHistory:[{ id:'h1', m:'2026-07', v:1e308, pv:1e308, pnl:-1e308, loan:1e308 }, { id:'h2', m:'2026-08', v:-1e308, pv:0, pnl:1e308, loan:0 }],
    dailyHistory:[{ d:'2026-09-01', pv:1e308, loan:0, eq:-1e308, pnl:1e308 }, { d:'2026-09-02', pv:-1e308, loan:1e308, eq:1e308, pnl:-1e308 }] });
  let html = '';
  for (const [t, l] of [['overview'], ['leverage', 'overview']]){ A.currentTab = t; if (l) A.levTab = l; A.renderAll(); html += document.getElementById('content').innerHTML; }
  const bad = html.match(/.{0,30}(NaN|Infinity).{0,10}/);
  return bad ? bad[0] : '';
});

check('歷史不夠時按「知道了」/「已調整完成」:不能把算不出來的 WATCH 記成看過的狀態', () => {
  A.state = A.emptyState();
  A.state.instruments.forEach(it => { it.priceHistory = []; it.trend.lastSeenStatus = ''; });
  const it = A.state.instruments[0];
  A.onClick({ dataset:{ act:'ack-trend', id: it.key } });
  A.onClick({ dataset:{ act:'ack-hold' } });
  const seen = A.state.instruments.map(x => x.trend.lastSeenStatus).filter(Boolean);
  return seen.length ? '記下了 ' + seen.join(',') : '';
});

check('走勢圖範圍照日期算:一個月內只有一筆時,範圍按鈕要留著、不能畫出兩個月前的點', () => {
  A.state = A.emptyState();
  A.state.instruments[0].price = 50;
  A.state.trades = [{ id:'t', date:'2025-01-01', symbol:'00631L', action:'buy', shares:100, price:40, fee:0, amount:0, source:'cash', note:'' }];
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  A.state.dailyHistory = [{ d: back(60), pv: 4000, loan: 0, eq: 4000, pnl: 0 }, { d: back(1), pv: 5000, loan: 0, eq: 5000, pnl: 1000 }];
  A.currentTab = 'leverage'; A.levTab = 'overview'; A.chartRange = 30; A.renderAll();
  const h1 = document.getElementById('content').innerHTML;
  if (!h1.includes('data-act="range"')) return '範圍按鈕不見了(切不回「全部」)';
  if (!h1.includes('這段期間只有 1 筆')) return '1 個月內只有一筆,應該說明而不是畫出兩個月前的點';
  A.chartRange = 0; A.renderAll();
  const h2 = document.getElementById('content').innerHTML;
  if (h2.includes('這段期間只有')) return '選「全部」還說只有一筆';
  A.chartRange = 90;
  return '';
});

check('曝險目標卡:歷史不夠時不能叫你把整個部位賣掉;只有一檔正2 時不能寫「各半」', () => {
  A.state = A.emptyState();
  A.state.instruments.forEach(it => { it.price = 50; it.priceHistory = []; });
  A.state.trades = [{ id:'t', date:'2025-01-01', symbol:'00631L', action:'buy', shares:1000, price:40, fee:0, amount:0, source:'cash', note:'' }];
  const h1 = A.renderExposurePlanCard();
  if (/減碼/.test(h1) && !/不給加碼\/減碼金額/.test(h1)) return '歷史不夠(算出來是 WATCH)卻建議減碼:' + h1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
  if (!h1.includes('歷史價格還不夠')) return '沒有說明在等歷史資料';
  // 只留一檔正2、歷史夠長
  A.state.instruments = A.state.instruments.filter(it => it.id === '00631L');
  const it = A.state.instruments[0], hist = [];
  const d = new Date(2024, 0, 1);
  for (let i = 0; hist.length < 400; i++){ d.setDate(d.getDate() + 1); if (d.getDay() % 6 === 0) continue;
    hist.push({ d: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'), c: 30 + i * 0.05 }); }
  it.priceHistory = hist; it.splits = [];
  const h2 = A.renderExposurePlanCard();
  if (h2.includes('各半') || h2.includes('00675L')) return '只有一檔正2 還寫「各半」或 00675L:' + h2.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160);
  return '';
});

check('標的改代號:舊代號「看過的狀態」要清掉;代號格式不對時說明要講代號,不是叫你去按更新', () => {
  A.state = A.emptyState();
  const it = A.state.instruments[0];
  it.trend.lastSeenStatus = 'HOLD'; it.trend.lastSeenDate = '2026-01-01';
  A.onField('in-id-' + it.key, { value: '0050' });
  if (it.trend.lastSeenStatus) return '改代號後還留著舊代號的狀態 ' + it.trend.lastSeenStatus;
  A.onField('in-id-' + it.key, { value: '台灣50' });
  A.currentTab = 'leverage'; A.levTab = 'signal'; A.renderAll();
  const h = document.getElementById('content').innerHTML;
  if (!h.includes('3~8 碼英數字')) return '代號不是證交所格式時沒有說明';
  return '';
});

check('匯入的資料 id 重複:刪一筆不能兩筆一起刪、資產跟負債 id 不能撞', () => {
  A.state = A.normalize({ transactions:[{ id:'dup', date:'2026-09-01', cat:'餐飲', desc:'午餐', amount:-100 }, { id:'dup', date:'2026-09-02', cat:'交通', desc:'捷運', amount:-30 }],
    assets:[{ id:'a', name:'現金', amount:1 }], liabilities:[{ id:'a', name:'房貸', amount:2 }] });
  if (A.state.assets[0].id === A.state.liabilities[0].id) return '資產跟負債還是同一個 id';
  A.onClick({ dataset:{ act:'del-tx', id: A.state.transactions[0].id } }); A.onClick({ dataset:{ act:'del-tx', id: A.state.transactions[0].id } });
  if (A.state.transactions.length !== 1) return '刪一筆後剩 ' + A.state.transactions.length + ' 筆(應該是 1)';
  return '';
});

check('買賣日期在未來要提示;第一筆投入未滿一年不年化(以前兩週漲 10% 那行直接消失)', () => {
  A.state = A.emptyState();
  A.state.instruments[0].price = 22;
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  A.state.trades = [{ id:'t', date: back(14), symbol:'00631L', action:'buy', shares:1000, price:20, fee:0, amount:0, source:'cash', note:'' }];
  A.currentTab = 'leverage'; A.levTab = 'overview'; A.renderAll();
  const h1 = document.getElementById('content').innerHTML;
  if (!h1.includes('未滿一年,不年化')) return '兩週前才買,年化報酬那行沒有說明不年化';
  A.state.trades.push({ id:'f', date:'2062-01-01', symbol:'00631L', action:'buy', shares:10, price:20, fee:0, amount:0, source:'cash', note:'' });
  A.levTab = 'log'; A.renderAll();
  if (!document.getElementById('content').innerHTML.includes('日期在未來')) return '2062 年的買賣沒有提示';
  return '';
});

check('事後在清單上把還款改成超過尚欠、或把日期清空:要標出來「不會計入」', () => {
  A.state = A.emptyState();
  A.state.leverage.draws = [{ id:'d1', label:'第一筆', amount:100000, useDate:'2025-01-01', note:'', repayments:[
    { id:'r1', date:'2025-06-01', amount:30000 }, { id:'r2', date:'2025-07-01', amount:30000 }, { id:'r3', date:'2025-08-01', amount:30000 }] }];
  A.onField('rp-amt-d1-r2', { value:'300000' });   // 手滑多打一個 0
  A.onField('rp-date-d1-r3', { value:'' });
  A.currentTab = 'leverage'; A.levTab = 'log'; A.renderAll();
  const h = document.getElementById('content').innerHTML;
  if (!h.includes('超過當時尚欠 NT$ 230,000')) return '還款改成超過尚欠,清單上沒有標出多的 230,000';
  if (!h.includes('沒有日期,這筆不會計入')) return '日期清空的還款沒有標示';
  return '';
});

check('借款超過「市值 + 額度」:曝險比例顯示 —、壓力測試不能說「還在目標之內」、負的金額寫 −NT$', () => {
  A.state = A.emptyState();
  A.state.instruments[0].price = 10; A.state.instruments[0].shares = 10000;
  A.state.leverage.creditLimit = 0;
  A.state.leverage.draws = [{ id:'d', label:'x', amount:500000, useDate:'2025-01-01', note:'', repayments:[] }];
  A.currentTab = 'leverage'; A.levTab = 'signal'; A.renderAll();
  const h = document.getElementById('content').innerHTML.replace(/<[^>]+>/g, ' ');
  if (/還在目標之內/.test(h)) return '借款超過市值 + 額度,壓力測試卻說「還在目標之內」';
  if (/NT\$ -\d/.test(h)) return '負的金額寫成「NT$ -…」';
  if (/加碼第|方案B/.test(h)) return '分母是負的還給加碼/減碼金額';
  A.levTab = 'overview'; A.renderAll();
  const h2 = document.getElementById('content').innerHTML.replace(/<[^>]+>/g, ' ');
  if (!/−NT\$ 400,000/.test(h2)) return '自己的錢沒有寫成 −NT$ 400,000';
  return '';
});

(async () => {
  // 證交所回應:最後一列(今天)收盤價是「--」;途中雲端同步把 state 換掉
  const realST = global.setTimeout;
  global.setTimeout = (f) => realST(f, 0);
  const waitIdle = async () => { for (let i = 0; i < 2000 && A.quoteBusy; i++) await new Promise(r => realST(r, 1)); };
  const roc = (d) => '115/09/' + String(d).padStart(2, '0');
  let lastDash = false, swap = false;
  global.fetch = async () => {
    const rows = [1, 2, 3].map(d => [roc(d), '1', '1', '1', '1', '1', (100 + d).toFixed(2), '+1', '1']);
    if (lastDash) rows[2][6] = '--';
    if (swap) A.state = A.normalize(JSON.parse(JSON.stringify(A.state)));
    return { ok: true, json: async () => ({ stat: 'OK', data: rows }) };
  };
  await waitIdle();
  const run = async (dash, sw) => {
    localStorage.removeItem('financeTwseCooldownUntil');
    lastDash = dash; swap = sw;
    A.state = A.emptyState();
    A.state.instruments.forEach(it => { it.auto = true; it.price = 50; });
    await A.fetchQuotes(false); await waitIdle();
    lastDash = swap = false;
    return A.state.instruments.filter(it => it.auto).map(it => it.price);
  };
  try{
    const p1 = await run(true, false);
    if (p1.some(p => p !== 102)) bugs.push('證交所最後一列收盤價是「--」 → 股價變成 ' + p1 + '(應該用前一天的 102)');
    const p2 = await run(false, true);
    if (p2.some(p => p !== 103)) bugs.push('抓報價途中 state 被雲端同步換掉 → 新的 state 股價是 ' + p2 + '(應該是 103)');
    // 歷史永遠不夠(剛上市)時,自動更新報價一天只順便回補一次,不能每次都再補 14 個月
    let reqs = 0;
    global.fetch = async () => { reqs++; return { ok: true, json: async () => ({ stat: 'OK', data: [[roc(1), '1', '1', '1', '1', '1', '100.00', '+1', '1']] }) }; };
    A.state = A.emptyState();
    A.state.instruments.forEach(it => { it.auto = true; });
    localStorage.removeItem('financeAutoBackfillDay');
    await A.fetchQuotes(false); await waitIdle();
    const first = reqs; reqs = 0;
    await A.fetchQuotes(false); await waitIdle();
    if (!(first > 10)) bugs.push('歷史不夠時第一次更新報價應該順便回補(只發了 ' + first + ' 個請求)');
    if (reqs > 6) bugs.push('同一天第二次自動更新報價又回補了一次(' + reqs + ' 個請求)');
    reqs = 0;
    await A.fetchQuotes(true); await waitIdle();
    if (!(reqs > 10)) bugs.push('手動按更新報價應該照樣回補(只發了 ' + reqs + ' 個請求)');
  }catch(e){ bugs.push('抓報價測試例外:' + e.message); }
  global.setTimeout = realST;

console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i) => '  ' + (i+1) + '. ' + b).join('\n') : '沒有發現問題');
if (bugs.length) process.exitCode = 1;
})();
