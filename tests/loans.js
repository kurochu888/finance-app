/* 房貸還款的測試:理財型每月最低還本(剩餘餘額 × ‰)、一般型房貸本利攤還(剩餘本金、升降息重算月付、
   每期利息記帳),以及兩台裝置/舊版分頁寫回來時不重複、不遺失。用假 Date 模擬跨月。 */
const RealDate = Date;
let simNow = new RealDate('2026-10-05T09:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a){ super(...(a.length ? a : [simNow])); }
  static now(){ return simNow; }
}
global.Date = FakeDate;
const setNow = iso => { simNow = new RealDate(iso + 'T09:00:00').getTime(); };

const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, className:'',
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) },
  get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, onField, onClick,
  maybePostInterest, maybeAutoRepay, amortize, nextLoanPayment, addMonthsISO, syncLoanLiabilities, postLoanInterest,
  applyLoanRate, leverageMonthPrincipal, monthLoanDues, computeLeverage, keepFieldsOldVersionsDrop, merge3, renderAssets,
  renderOverview, renderLeverage, normalizeLoan, cashFlows, AUTO_REPAY_PREFIX, set levTab(v){ levTab = v; } };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const field = (key, value) => A.onField(key, { value: String(value) });
// 獨立算的等額本息月付,不用 app 的函式
const annuity = (B, annualPct, n) => { const r = annualPct / 1200; return r ? B * r / (1 - Math.pow(1 + r, -n)) : B / n; };

console.log('日期:每月同一天,沒有那天用月底');
must(A.addMonthsISO('2026-01-31', 1) === '2026-02-28', '1/31 + 1 個月應該是 2/28,得到 ' + A.addMonthsISO('2026-01-31', 1));
must(A.addMonthsISO('2028-01-31', 1) === '2028-02-29', '閏年 1/31 + 1 個月應該是 2/29');
must(A.addMonthsISO('2026-11-15', 2) === '2027-01-15', '跨年');

console.log('一般型房貸:本利攤還,繳完剛好歸零');
{
  const lo = A.normalizeLoan({ principal: 6000000, start: '2006-10-01', years: 20, annualRate: 2.3 });
  const all = A.amortize(lo, '2099-12-31');
  must(all.rows.length === 240, '20 年應該 240 期,得到 ' + all.rows.length);
  must(near(all.balance, 0, 0.01), '繳完餘額應該是 0,得到 ' + all.balance);
  const pay = annuity(6000000, 2.3, 240);
  must(all.rows.every(r => near(r.payment, pay, 0.001)), '利率不變時每期月付應該都是 ' + pay.toFixed(2));
  must(near(all.rows[0].interest, 6000000 * 0.023 / 12), '第一期利息 = 本金 × 年利率 ÷ 12');
  must(near(all.rows.reduce((t, r) => t + r.principal, 0), 6000000, 0.01), '每期本金加起來 = 原始貸款');
  console.log('  600 萬 20 年 2.3%:每月 ' + pay.toFixed(0) + ',第一期利息 ' + all.rows[0].interest.toFixed(0));
}

console.log('一般型房貸:升降息後,用剩餘本金、剩餘期數、新利率重算月付');
{
  // 2024-10-01 撥款 1000 萬 30 年;2025-04-01 起從 2.1% 升到 2.3%(rateHistory until 2025-04-01 之前是 2.1)
  const lo = A.normalizeLoan({ principal: 10000000, start: '2024-10-01', years: 30, annualRate: 2.3,
    rateHistory: [{ id: 'r1', until: '2025-04-01', rate: 2.1 }] });
  const a = A.amortize(lo, '2026-10-05');
  must(a.rows.length === 24, '到 2026-10-05 應該繳了 24 期,得到 ' + a.rows.length);
  // 前 6 期(期初 2024-10-01 ~ 2025-03-01)照 2.1%
  const p1 = annuity(10000000, 2.1, 360);
  must(a.rows.slice(0, 6).every(r => near(r.payment, p1, 0.001)), '前 6 期應該照 2.1% 月付 ' + p1.toFixed(2));
  // 第 7 期起照 2.3%,用第 6 期繳完的餘額、剩 354 期重算
  const p2 = annuity(a.rows[5].balance, 2.3, 354);
  must(near(a.rows[6].payment, p2, 0.001), '升息後月付應該重算成 ' + p2.toFixed(2) + ',得到 ' + a.rows[6].payment.toFixed(2));
  must(p2 > p1, '升息後月付應該變多');
  const nx = A.nextLoanPayment(lo);
  must(nx.k === 25 && nx.date === '2026-11-01', '下一期應該是第 25 期 2026-11-01,得到 ' + JSON.stringify(nx));
  must(near(nx.payment, annuity(a.balance, 2.3, 336), 0.001), '下一期月付 = 目前餘額照目前利率、剩 336 期');
  console.log('  2.1% 月付 ' + p1.toFixed(0) + ' → 升到 2.3% 後 ' + p2.toFixed(0));
}

console.log('一般型房貸:負債金額自動 = 剩餘本金,每期利息記帳一次');
{
  setNow('2026-10-05');
  const s = A.emptyState();
  s.liabilities = [{ id: 'm1', name: '一般房貸', amount: 0, loan: null }];
  A.state = A.normalize(s);
  A.onClick({ dataset: { act: 'loan-on', id: 'm1' } });
  must(A.state.liabilities[0].loan, '按「是本利攤還的房貸」之後要有 loan');
  field('lo-principal-m1', 8000000);
  field('lo-start-m1', '2016-10-03');
  field('lo-years-m1', 30);
  A.applyLoanRate('m1', '2.3');           // 第一次填利率(原本 0)不算升降息
  const lo = A.state.liabilities[0].loan;
  must(lo.rateHistory.length === 0, '第一次填利率不應該記成一段過去利率:' + JSON.stringify(lo.rateHistory));
  const a = A.amortize(lo);
  must(a.rows.length === 120, '2016-10-03 起到 2026-10-05 應該繳了 120 期,得到 ' + a.rows.length);
  must(A.state.liabilities[0].amount === Math.round(a.balance), '負債金額應該等於剩餘本金 ' + Math.round(a.balance) + ',得到 ' + A.state.liabilities[0].amount);
  // 自己打金額不算(唯讀)
  field('la-m1', 123);
  must(A.state.liabilities[0].amount === Math.round(a.balance), '本利攤還的負債不能手動改金額');

  A.maybePostInterest();
  const tx = A.state.transactions.filter(t => t.cat === '房貸利息' && t.desc.includes('一般房貸'));
  must(tx.length === 1, '本月(10/03 已扣款)應該記一筆利息,得到 ' + tx.length);
  must(tx[0] && tx[0].date === '2026-10-03' && tx[0].amount === -Math.round(a.rows[119].interest), '利息那筆的日期/金額不對:' + JSON.stringify(tx[0]));
  A.maybePostInterest();
  must(A.state.transactions.filter(t => t.desc.includes('一般房貸')).length === 1, '再開一次不能重複記');
  must(!A.state.transactions.some(t => t.cat !== '房貸利息'), '還本不應該進記帳');

  // 跨到下個月,扣款日前不記、扣款日後記;中間沒開 app 的月份補記
  setNow('2026-11-02');
  A.maybePostInterest();
  must(A.state.transactions.filter(t => t.desc.includes('一般房貸')).length === 1, '11/03 扣款日前不應該記 11 月利息');
  setNow('2027-01-10');
  A.maybePostInterest();
  const tx2 = A.state.transactions.filter(t => t.desc.includes('一般房貸')).map(t => t.date).sort();
  must(JSON.stringify(tx2) === JSON.stringify(['2026-10-03', '2026-11-03', '2026-12-03', '2027-01-03']), '補記月份不對:' + tx2.join(','));
  must(A.state.liabilities[0].amount === Math.round(A.amortize(lo).balance), '跨月後負債金額要跟著減少');
  // 刪掉一筆不會補回
  const del = A.state.transactions.find(t => t.date === '2026-12-03');
  A.state.transactions = A.state.transactions.filter(t => t !== del);
  A.maybePostInterest();
  must(!A.state.transactions.some(t => t.date === '2026-12-03'), '刪掉的利息不應該被補回');

  // 升息:2027-01-10 改 2.5%,今天以前照 2.3%
  const before = A.nextLoanPayment(lo).payment;
  A.applyLoanRate('m1', '2.5');
  must(lo.rateHistory.length === 1 && lo.rateHistory[0].until === '2027-01-10' && lo.rateHistory[0].rate === 2.3, '升息應該記一段「到今天為止 2.3%」:' + JSON.stringify(lo.rateHistory));
  must(A.nextLoanPayment(lo).payment > before, '升息後下一期月付要變多');
  A.applyLoanRate('m1', '2.55');          // 同一天再改不再多記一段
  must(lo.rateHistory.length === 1, '同一天再改利率不應該多記一段');

  // 本月要繳
  const dues = A.monthLoanDues();
  must(dues.length === 1 && dues[0].name === '一般房貸' && near(dues[0].principal + dues[0].interest, A.amortize(lo).rows.find(r => r.date === '2027-01-03').payment), '本月要繳應該是 1/03 那期:' + JSON.stringify(dues));
  must(/房貸設定|本利攤還/.test(A.renderAssets()), '資產頁要看得到本利攤還的設定');
  must(A.renderOverview().includes('房貸要繳'), '總覽要有本月房貸要繳');

  // 改回自己填金額
  A.onClick({ dataset: { act: 'loan-off', id: 'm1' } });
  A.onClick({ dataset: { act: 'loan-off', id: 'm1' } });
  must(A.state.liabilities[0].loan === null, '按兩次「改回自己填金額」之後 loan 應該是 null');
  field('la-m1', 5000000);
  must(A.state.liabilities[0].amount === 5000000, '改回之後可以自己填金額');
}

console.log('理財型:每月 1 日自動還本(剩餘餘額 × ‰)');
{
  setNow('2026-10-05');
  const s = A.emptyState();
  s.leverage.draws = [
    { id: 'd1', label: '第一筆', amount: 1000000, useDate: '2026-06-15', note: '', repayments: [] },
    { id: 'd2', label: '這個月才借', amount: 500000, useDate: '2026-10-02', note: '', repayments: [] },
    { id: 'd3', label: '自己還過', amount: 300000, useDate: '2026-01-10', note: '', repayments: [{ id: 'x1', date: '2026-10-03', amount: 2000 }] }
  ];
  A.state = A.normalize(s);
  must(A.state.leverage.autoRepay === true && A.state.leverage.repayPermille === 5, '預設應該開啟、千分之 5');
  A.maybePostInterest();
  const L = A.state.leverage;
  const rp = d => L.draws.find(x => x.id === d).repayments;
  must(rp('d1').length === 1 && rp('d1')[0].id === 'autorepay202610' && rp('d1')[0].date === '2026-10-01' && rp('d1')[0].amount === 5000,
    '第一筆應該記 10/01 還 5,000:' + JSON.stringify(rp('d1')));
  must(rp('d2').length === 0, '本月才動用的不應該還本');
  must(rp('d3').length === 1, '本月已經自己記過還款的不應該再記');
  must(!rp('d1')[0].id.includes('-'), '自動還款 id 不能有「-」(rp- 欄位用「-」切)');
  // 第一次只記本月,不回頭補 7~9 月
  must(L.repayPosted.join() === '2026-10', '第一次只處理本月:' + L.repayPosted.join());
  A.maybePostInterest();
  must(rp('d1').length === 1, '同月再開不能重複還');
  // 本月利息照還本後的餘額
  must(near(A.computeLeverage().usedAmount, 995000 + 500000 + 298000), '借款餘額應該扣掉還本');
  const mp = A.leverageMonthPrincipal();
  must(mp.amount === 7000 && !mp.estimate, '本月還本應該是 5,000 + 2,000(自己記的):' + JSON.stringify(mp));
  // 中間沒開 app:補 11、12 月,金額照當時餘額遞減
  setNow('2026-12-20');
  A.maybePostInterest();
  const amts = rp('d1').map(r => r.date + ':' + r.amount).join(' ');
  must(amts === '2026-10-01:5000 2026-11-01:4975 2026-12-01:4950', '補記金額應該照餘額遞減:' + amts);
  must(rp('d2').map(r => r.amount).join() === '2500,2488', '11 月起才還:' + rp('d2').map(r => r.amount).join());
  // 刪掉自動那筆不補回
  L.draws[0].repayments = L.draws[0].repayments.filter(r => r.date !== '2026-12-01');
  A.maybePostInterest();
  must(!rp('d1').some(r => r.date === '2026-12-01'), '刪掉的自動還本不應該被補回');
  // 關掉 → 跨月 → 打開:關掉期間不補
  A.onClick({ dataset: { act: 'toggle-autorepay' } });
  setNow('2027-02-03');
  A.maybePostInterest();
  must(!rp('d1').some(r => r.date >= '2027-01-01'), '關掉時不應該記');
  A.onClick({ dataset: { act: 'toggle-autorepay' } });
  must(!rp('d1').some(r => r.date === '2027-01-01') && rp('d1').some(r => r.date === '2027-02-01'), '重新打開只記本月,不補關掉期間');
  // 改千分比
  field('lev-repayPermille', 10);
  must(L.repayPermille === 10, '千分比欄位');
  field('lev-repayPermille', 99999);
  must(L.repayPermille === 1000, '千分比最多 1000');
  // 還本算進 XIRR 的自有資金流出
  must(A.cashFlows(false).some(f => f.date === '2026-11-01' && f.amount < 0), '還本要算成自有資金流出');
  A.levTab = 'setup';
  must(A.renderLeverage().includes('本月要繳'), '槓桿頁「設定」要顯示本月要繳');
}

console.log('兩台裝置同時補記、舊版分頁寫回來');
{
  setNow('2026-10-05');
  const s = A.emptyState();
  s.leverage.draws = [{ id: 'd1', label: 'x', amount: 1000000, useDate: '2026-06-15', note: '', repayments: [] }];
  s.liabilities = [{ id: 'm1', name: '房貸', amount: 0, loan: { principal: 5000000, start: '2020-01-02', years: 20, annualRate: 2.3, rateHistory: [{ id: 'q1', until: '2024-01-01', rate: 1.9 }] } }];
  const base = A.normalize(JSON.parse(JSON.stringify(s)));
  A.state = A.normalize(JSON.parse(JSON.stringify(s))); A.maybePostInterest();
  const devA = JSON.parse(JSON.stringify(A.state));
  A.state = A.normalize(JSON.parse(JSON.stringify(s))); A.maybePostInterest();
  const devB = JSON.parse(JSON.stringify(A.state));
  const merged = A.normalize(A.merge3(devA, base, devB));
  must(merged.leverage.draws[0].repayments.length === 1, '兩台各自補記同一個月的還本,合併後應該只有一筆:' + merged.leverage.draws[0].repayments.length);
  const li = x => x.transactions.filter(t => t.id.startsWith('li-')).length;
  must(li(devA) === 1 && li(merged) === 1, '兩台各自記的一般型利息,合併後不能變兩筆:' + li(merged));

  // 舊版分頁:負債只留 id/name/amount,槓桿沒有還本設定
  const prev = A.normalize(JSON.parse(JSON.stringify(devA)));
  prev.leverage.repayPermille = 8;
  const old = JSON.parse(JSON.stringify(prev));
  old.liabilities = old.liabilities.map(l => ({ id: l.id, name: l.name, amount: l.amount }));
  delete old.leverage.autoRepay; delete old.leverage.repayPermille; delete old.leverage.repayPosted;
  const next = A.normalize(old);
  must(next.liabilities[0].loan === null && next.leverage.repayPermille === 5, '前提:舊版寫回來會丟掉 loan 跟千分比');
  must(A.keepFieldsOldVersionsDrop(prev, old, next) === true, '應該回報有補回');
  must(next.liabilities[0].loan && next.liabilities[0].loan.rateHistory.length === 1, '舊版寫回來後一般型房貸設定要補回');
  must(next.leverage.repayPermille === 8 && next.leverage.repayPosted.includes('2026-10'), '舊版寫回來後還本設定要補回');
  // 新版自己改回「自己填金額」(loan: null)不能被當成舊版丟掉而補回
  const cleared = JSON.parse(JSON.stringify(prev)); cleared.liabilities[0].loan = null;
  const next2 = A.normalize(cleared);
  A.keepFieldsOldVersionsDrop(prev, cleared, next2);
  must(next2.liabilities[0].loan === null, '新版刻意清掉的 loan 不能被補回');
  // normalize 冪等
  const n1 = A.normalize(devA), n2 = A.normalize(JSON.parse(JSON.stringify(n1)));
  must(JSON.stringify(n1) === JSON.stringify(n2), 'normalize 存檔往返後要一樣');
}

if (bugs.length){
  console.log('\n發現 ' + bugs.length + ' 個問題:');
  bugs.forEach(b => console.log('  ✗ ' + b));
  process.exitCode = 1;
}else console.log('\n沒有發現問題');
