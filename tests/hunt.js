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
  get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  renderAll, sampleData, emptyState, normalize, onClick, onField, computeLeverage,
  computePosition, computeRisk, heldShares, findInstrument, accrue, outstanding, netWorth
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

console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i) => '  ' + (i+1) + '. ' + b).join('\n') : '沒有發現問題');
