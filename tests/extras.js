/* 房貸買進順便建動用記錄(T+2 交割日)、隱藏金額、年度總結。 */
const RealDate = Date;
let simNow = new RealDate('2026-10-08T09:00:00').getTime();
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
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];

eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, sampleData, onClick,
  settleDate, renderTrades, get tradeDraft(){return tradeDraft}, set tradeDraft(v){tradeDraft=v}, get tradeNote(){return tradeNote},
  computeLeverage, loanMismatch, togglePrivacy, fmt, renderOverview, renderLedger, get privacy(){return privacy},
  set viewMonth(v){viewMonth=v}, unusedLoanCash, keepFieldsOldVersionsDrop, computePosition, plannedDrawAmount, nextLevInterest, renderLeverage, set levTab(v){levTab=v}, yearSummary, renderYearCard, set summaryYear(v){summaryYear=v} };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

console.log('交割日 T+2(跳過週末)');
must(A.settleDate('2026-10-07') === '2026-10-09', '週三 → 週五,得到 ' + A.settleDate('2026-10-07'));
must(A.settleDate('2026-10-08') === '2026-10-12', '週四 → 下週一,得到 ' + A.settleDate('2026-10-08'));
must(A.settleDate('2026-10-09') === '2026-10-13', '週五 → 下週二,得到 ' + A.settleDate('2026-10-09'));

console.log('房貸買進順便新增動用');
A.state = A.normalize(A.emptyState());
A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'10000', price:'40', amount:'', fee:'570', note:'', loanAmt:'', autoDraw:true };
A.onClick({ dataset:{ act:'add-trade' } });
let dr = A.state.leverage.draws;
must(dr.length === 1 && dr[0].amount === 400570 && dr[0].useDate === '2026-10-09', '要新增一筆 400,570、10/09 的動用:' + JSON.stringify(dr));
must(/已同時新增/.test(A.tradeNote), '提示要說已經新增了:' + A.tradeNote);
must(!A.loanMismatch(), '自動新增之後兩邊金額要對得起來');
must(A.tradeDraft.autoDraw === true, '新增後草稿保留這個選項');
must(A.computeLeverage().usedAmount === 0, '今天 10/08,10/09 交割日還沒到,不算借款');

console.log('兩者都有:只記房貸那部分');
A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'mix', shares:'10000', price:'25', amount:'', fee:'356', note:'', loanAmt:'150000', autoDraw:true };
A.onClick({ dataset:{ act:'add-trade' } });
dr = A.state.leverage.draws;
const loanTrade = A.state.trades.filter(t => t.source === 'loan').pop();
must(dr.length === 2 && dr[1].amount === Math.round(loanTrade.shares * loanTrade.price + loanTrade.fee) && dr[1].amount <= 150000, '動用金額 = 房貸那筆:' + JSON.stringify(dr[1]));
must(!A.loanMismatch(), '拆單之後兩邊也對得起來');

console.log('之前借了沒用完的先扣掉');
{
  const keep = A.state;
  A.state = A.normalize(A.emptyState());
  A.state.leverage.draws.push({ id:'w1', label:'整數動用', amount:350000, useDate:'2026-09-03', note:'', repayments:[] });
  A.state.trades.push({ id:'b1', date:'2026-09-01', symbol:'00631L', action:'buy', source:'loan', shares:10000, price:34.8, fee:496, amount:0, note:'' });
  must(A.unusedLoanCash() === 1504, '35 萬買了 348,496,剩 1,504:' + A.unusedLoanCash());
  must(A.renderTrades().includes('先扣之前沒用完的 1,504') || A.tradeDraft.source !== 'loan', '草稿按鈕要說會先扣');
  A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'2500', price:'40', amount:'', fee:'142', note:'', loanAmt:'', autoDraw:true };
  must(A.renderTrades().includes('先扣之前沒用完的 1,504'), '草稿按鈕要說會先扣');
  A.onClick({ dataset:{ act:'add-trade' } });
  let ds = A.state.leverage.draws;
  must(ds.length === 2 && ds[1].amount === 100142 - 1504, '買 100,142 只新增 98,638:' + JSON.stringify(ds[1]));
  must(/先用掉之前借了沒用完的 NT\$ 1,504/.test(A.tradeNote), '提示要說用掉了多少:' + A.tradeNote);
  must(A.unusedLoanCash() === 0, '用完了');
  // 再借一筆整數,買得比較少:剩下的夠下一筆就不新增
  ds.push({ id:'w2', label:'整數動用', amount:50000, useDate:'2026-10-09', note:'', repayments:[] });
  A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'1000', price:'40', amount:'', fee:'57', note:'', loanAmt:'', autoDraw:true };
  A.onClick({ dataset:{ act:'add-trade' } });
  must(ds.length === 3 && /不用新增動用/.test(A.tradeNote) && /9,943/.test(A.tradeNote), '剩的 50,000 夠買 40,057,不新增、還剩 9,943:' + A.tradeNote);
  must(!A.loanMismatch(), '兩邊還是對得起來');
  // 全部還清了:手上不會有借來的錢(只還一部分的話分不出來是不是用剩下的錢還的,照帳面算)
  ds.forEach((d, i) => d.repayments.push({ id:'rr' + i, date:'2026-10-10', amount:d.amount }));
  must(A.unusedLoanCash() === 0, '都還清了就不能再拿來扣:' + A.unusedLoanCash());
  A.state = keep;
}

console.log('動用金額湊整到萬元(自己先轉整數到交割戶)');
{
  const keep = A.state;
  A.state = A.normalize(A.emptyState());
  must(A.state.leverage.drawRound === 0, '預設不湊整');
  A.onClick({ dataset:{ act:'draw-round', v:'10000' } });
  must(A.state.leverage.drawRound === 10000, '選萬元');
  A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'2500', price:'40', amount:'', fee:'142', note:'', loanAmt:'', autoDraw:true };
  must(A.renderTrades().includes('湊整到萬元'), '草稿按鈕要說會湊整');
  A.onClick({ dataset:{ act:'add-trade' } });
  const ds = A.state.leverage.draws;
  must(ds.length === 1 && ds[0].amount === 110000, '買 100,142 → 動用 110,000:' + JSON.stringify(ds));
  must(/多的 NT\$ 9,858 下次房貸買進先扣/.test(A.tradeNote), '提示要說多借了多少:' + A.tradeNote);
  A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'100', price:'40', amount:'', fee:'20', note:'', loanAmt:'', autoDraw:true };
  A.onClick({ dataset:{ act:'add-trade' } });
  must(ds.length === 1 && /不用新增動用/.test(A.tradeNote), '多借的夠買 4,020,不新增:' + A.tradeNote);
  A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'1000', price:'40', amount:'', fee:'57', note:'', loanAmt:'', autoDraw:true };
  A.onClick({ dataset:{ act:'add-trade' } });
  must(ds.length === 2 && ds[1].amount === 40000, '剩 5,838,買 40,057 差 34,219 → 湊整 40,000:' + JSON.stringify(ds[1]));
  must(!A.loanMismatch(), '湊整的差額在容許範圍內');
  A.onClick({ dataset:{ act:'draw-round', v:'1000' } });
  must(A.state.leverage.drawRound === 1000, '選千元');
  must(A.normalize({ ...A.state, leverage: { ...A.state.leverage, drawRound: 777 } }).leverage.drawRound === 0, '亂填的值當不湊整');
  must(A.normalize(JSON.parse(JSON.stringify(A.state))).leverage.drawRound === 1000, '存檔往返要保留');
  // 舊版分頁寫回來沒有 drawRound:要保留本機的
  const raw = JSON.parse(JSON.stringify(A.state)); delete raw.leverage.drawRound;
  const next = A.normalize(raw);
  A.keepFieldsOldVersionsDrop(A.state, raw, next);
  must(next.leverage.drawRound === 1000, '舊版分頁寫回來要保留湊整設定:' + next.leverage.drawRound);
  A.state = keep;
}

console.log('關掉就不新增(已經先記過動用的人)、自有資金不新增');
A.onClick({ dataset:{ act:'draft-autodraw' } });
must(A.tradeDraft.autoDraw === false, '按一下關掉');
must(A.renderTrades().includes('不自動新增房貸動用'), '關掉的狀態要看得出來');
Object.assign(A.tradeDraft, { source:'loan', shares:'1000', price:'40' });
A.onClick({ dataset:{ act:'add-trade' } });
must(A.state.leverage.draws.length === 2 && /記得/.test(A.tradeNote), '關掉時只提醒、不新增');
Object.assign(A.tradeDraft, { source:'cash', shares:'1000', price:'40', autoDraw:true });
A.onClick({ dataset:{ act:'add-trade' } });
must(A.state.leverage.draws.length === 2, '自有資金不新增動用');
must(!A.renderTrades().includes('同時新增房貸動用'), '選自有資金時不顯示這個選項');

console.log('預定動用:剩餘可動用先扣掉,並列出網路銀行現在看到的(使用者 2026-10-08 的真實數字)');
{
  const keep = A.state;
  A.state = A.normalize(A.emptyState());
  Object.assign(A.state.leverage, { annualRate: 2.58, payDay: 17, creditLimit: 8000000, rateHistory: [] });
  A.state.leverage.draws = [['2026-10-05', 200000], ['2026-10-06', 420000], ['2026-10-08', 1200000], ['2026-10-12', 410000], ['2026-10-12', 360000]]
    .map(([d, a], i) => ({ id: 'u' + i, label: '動用', amount: a, useDate: d, note: '', repayments: [] }));
  must(A.plannedDrawAmount() === 770000, '預定 770,000:' + A.plannedDrawAmount());
  const ni = A.nextLevInterest();
  must(ni.amount === 1532 && ni.bank === 1260 && ni.label.includes('10/17'), '10/17 利息 app 1,532、網路銀行 1,260:' + JSON.stringify(ni));
  A.levTab = 'settings';
  const t = A.renderLeverage().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  must(/剩餘可動用\(已扣預定動用\) NT\$ 5,410,000/.test(t), '剩餘可動用 = 800 萬 − 182 萬 − 77 萬:' + (t.match(/剩餘可動用[^網]*/) || [''])[0]);
  must(/網路銀行現在顯示\(預定的 770,000 還沒轉出\) NT\$ 6,180,000/.test(t), '要列網路銀行現在的 6,180,000');
  must(/網路銀行現在顯示\(不含還沒轉出的預定動用\) NT\$ 1,260/.test(t), '要列網路銀行現在的利息 1,260');
  A.levTab = 'overview';
  A.state = keep;
}

console.log('隱藏金額');
A.state = A.sampleData();
A.viewMonth = '2026-10';
const shown = A.renderOverview();
must(/9,\d{3},\d{3}/.test(shown), '平常要看得到淨資產');
A.togglePrivacy();
must(A.privacy === true && localStorage.getItem('financePrivacy') === '1', '打開後要記在這台裝置');
const hidden = A.renderOverview() + A.renderLedger();
must(!/\d{1,3}(,\d{3})+/.test(hidden.replace(/<[^>]+>/g, ' ').replace(/value="[^"]*"/g, '')), '隱藏時畫面上不該有金額:' + (hidden.replace(/<[^>]+>/g, ' ').match(/\d{1,3}(,\d{3})+/) || [''])[0]);
must(hidden.includes('••••'), '隱藏時要顯示 ••••');
A.tradeDraft = { date:'2026-10-07', symbol:'00631L', action:'buy', source:'loan', shares:'12000', price:'40', amount:'', fee:'', note:'', loanAmt:'', autoDraw:true };
A.onClick({ dataset:{ act:'add-trade' } });
must(/12,000 股/.test(A.state.leverage.draws.pop().note), '隱藏時自動新增的動用備註要存真的股數,不能存成 ••••');
A.togglePrivacy();
must(A.privacy === false && A.fmt(1234) === '1,234', '關掉後恢復');

console.log('年度總結(手算對照)');
{
  A.state = A.normalize(A.emptyState());
  A.state.assets = [{ id:'a1', name:'現金', amount: 1500000 }];
  A.state.liabilities = [{ id:'l1', name:'信貸', amount: 200000, loan:null }];
  A.state.netWorthHistory = [
    { id:'h1', m:'2025-06', v: 800000, pv:0, pnl: 0, loan:0, items:[], auto:true },
    { id:'h2', m:'2025-12', v: 1000000, pv:0, pnl: 10000, loan:0, items:[], auto:true }];
  A.state.transactions = [
    { id:'x1', date:'2025-12-31', cat:'薪資', desc:'', amount: 100000 },     // 去年的不算
    { id:'x2', date:'2026-01-05', cat:'薪資', desc:'', amount: 120000 },
    { id:'x3', date:'2026-02-05', cat:'薪資', desc:'', amount: 120000 },
    { id:'x4', date:'2026-02-10', cat:'餐飲', desc:'', amount: -30000 },
    { id:'x5', date:'2026-03-10', cat:'交通', desc:'', amount: -10000 }];
  A.state.instruments = [{ key:'k1', id:'00631L', leverage:2, price: 50 }];
  A.state.trades = [
    { id:'t1', date:'2026-01-02', symbol:'00631L', action:'buy', shares:2000, price:50, fee:0, source:'cash' },
    { id:'t2', date:'2026-01-03', symbol:'00631L', action:'buy', shares:4000, price:50, fee:0, source:'loan' },
    { id:'t3', date:'2026-05-01', symbol:'00631L', action:'sell', shares:1000, price:60, fee:100 },
    { id:'t4', date:'2026-07-01', symbol:'00631L', action:'dividend', amount:3000, fee:0 },
    { id:'t5', date:'2026-12-01', symbol:'00631L', action:'buy', shares:1000, price:50, fee:0, source:'cash' }];   // 未來的不算
  A.state.leverage.annualRate = 2.4;
  A.state.leverage.draws = [{ id:'d1', label:'', amount: 1000000, useDate:'2026-01-01', note:'', repayments:[{ id:'r1', date:'2026-06-01', amount: 0 }] }];
  A.state = A.normalize(A.state);
  const y = A.yearSummary(2026);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  must(y.income === 240000 && y.expense === 40000 && y.balance === 200000, '收支 240,000 / 40,000 / 200,000:' + [y.income, y.expense, y.balance]);
  must(y.topCats[0].name === '餐飲' && y.topCats[0].amount === 30000, '最大支出類別是餐飲 30,000');
  must(y.buyCash === 100000 && y.buyLoan === 200000 && y.sellNet === 59900 && y.dividends === 3000, '投資進出:' + [y.buyCash, y.buyLoan, y.sellNet, y.dividends]);
  // 1/1 到 10/8 共 280 天,100 萬 × 2.4% × 280 / 365
  must(near(y.interest, 1000000 * 0.024 * 280 / 365), '今年利息算到今天:' + y.interest);
  must(y.nwStart === 1000000 && y.nwEnd === 1300000 && y.nwStartLabel === '年初', '淨資產從去年 12 月 100 萬到現在 130 萬:' + [y.nwStart, y.nwEnd, y.nwStartLabel]);
  const y25 = A.yearSummary(2025);
  must(y25.income === 100000 && y25.interest === 0 && y25.nwStart === 800000 && y25.nwEnd === 1000000 && y25.nwStartLabel === '2025年6月', '2025:沒有前年 12 月就從最早那個月:' + JSON.stringify([y25.nwStart, y25.nwEnd, y25.nwStartLabel]));
  must(near(y25.pnlChange, 10000), '2025 整體損益變化 10,000:' + y25.pnlChange);
  // 使用者回報的情況:今年才開始投資,幾個月後才開始用 app(第一個快照就已經賺了),年初整體損益要當 0
  {
    const keep = A.state;
    const st = JSON.parse(JSON.stringify(keep));
    st.netWorthHistory = [{ id:'s9', m:'2026-08', v: 900000, pv:0, pnl: 50000, loan:0, items:[], auto:true }];
    A.state = A.normalize(st);
    const yy = A.yearSummary(2026), total = A.computePosition().total;
    must(near(yy.pnlChange, total) && !yy.pnlStartLabel, '今年才開始投資:整體損益變化 = 目前整體損益 ' + Math.round(total) + ',得到 ' + yy.pnlChange);
    // 去年就有投資、去年 12 月又沒有快照:只能跟今年最早那個月比,要標出月份
    st.trades.push({ id:'t0', date:'2025-03-01', symbol:'00631L', action:'buy', shares:100, price:50, fee:0, source:'cash' });
    A.state = A.normalize(st);
    const y2 = A.yearSummary(2026);
    must(near(y2.pnlChange, A.computePosition().total - 50000) && y2.pnlStartLabel === '2026年8月', '跟 8 月比要標出來:' + [y2.pnlChange, y2.pnlStartLabel]);
    A.summaryYear = 2026;
    must(A.renderYearCard().includes('(比2026年8月)'), '卡片上要寫比哪個月');
    A.state = keep;
  }
  A.summaryYear = 2026;
  const html = A.renderYearCard();
  must(html.includes('2026 年總結') && html.includes('240,000') && html.includes('儲蓄率'), '卡片要畫出來');
  A.onClick({ dataset:{ act:'sum-year', v:'-1' } });
  must(A.renderYearCard().includes('2025 年總結'), '◀ 切到前一年');
  A.onClick({ dataset:{ act:'sum-year', v:'-1' } });
  must(A.renderYearCard().includes('2025 年總結'), '最早一年不能再往前');
  A.state = A.normalize(A.emptyState());
  must(A.renderYearCard().includes('沒有紀錄'), '空資料說沒有紀錄');
}

if (bugs.length){
  console.log('\n發現 ' + bugs.length + ' 個問題:');
  bugs.forEach(b => console.log('  ✗ ' + b));
  process.exitCode = 1;
}else console.log('\n沒有發現問題');
