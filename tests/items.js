/* 資產/負債細項每月留存的測試:每月快照要存下當時每一筆的金額,過了月份就固定;
   資產頁「比上月」跟每月紀錄要讀得出來。用假 Date 模擬跨月。 */
const RealDate = Date;
let simNow = new RealDate('2026-09-20T09:00:00').getTime();
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
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) },
  get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, maybeSnapshot,
  onField, onClick, maybePostInterest, prevItemAmount, itemHistory, itemDeltaText, itemDeltaClass, renderAssets, applyRemote, sampleData,
  set itemHistOpen(v){ itemHistOpen = v; } };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const field = (key, value) => A.onField(key, { value: String(value) });

console.log('每月快照會存下每一筆資產/負債,改細項時本月快照跟著更新');
const s = A.emptyState();
s.assets = [{ id:'a1', name:'活存', amount:100000 }, { id:'a2', name:'股票', amount:500000 }];
s.liabilities = [{ id:'l1', name:'房貸', amount:3000000 }];
A.state = s;
A.maybeSnapshot();
let sep = A.state.netWorthHistory.find(h => h.m === '2026-09');
must(sep && sep.items.length === 3, `9 月快照應該有 3 筆細項,得到 ${JSON.stringify(sep && sep.items)}`);
field('aa-a1', 120000);
sep = A.state.netWorthHistory.find(h => h.m === '2026-09');
must(sep.items.find(x => x.id === 'a1').amount === 120000, '改了活存,9 月快照的細項應該馬上跟著更新');
must(sep.v === 120000 + 500000 - 3000000, `9 月淨資產也要跟著更新,得到 ${sep.v}`);
console.log('  ok');

console.log('跨到下個月:上個月的細項固定下來,「比上月」算得出差額(負債變多是壞事,顏色反過來)');
simNow = new RealDate('2026-10-05T09:00:00').getTime();
field('aa-a2', 550000);
field('la-l1', 2980000);
field('an-a1', '台幣活存');                              // 改名:用 id 對應,歷史要接得起來
sep = A.state.netWorthHistory.find(h => h.m === '2026-09');
const oct = A.state.netWorthHistory.find(h => h.m === '2026-10');
must(sep.items.find(x => x.id === 'a2').amount === 500000, '10 月改股票,9 月的紀錄不能跟著變');
must(oct && oct.items.find(x => x.id === 'a2').amount === 550000, '10 月快照要記下新的股票金額');
must(A.itemDeltaText('a2', 550000) === '比上月 +50,000', `股票比上月應該 +50,000,得到 ${A.itemDeltaText('a2', 550000)}`);
must(A.itemDeltaClass('a2', 550000, false) === 'pos', '資產變多應該是綠色');
must(A.itemDeltaText('l1', 2980000) === '比上月 −20,000', `房貸比上月應該 −20,000,得到 ${A.itemDeltaText('l1', 2980000)}`);
must(A.itemDeltaClass('l1', 2980000, true) === 'pos', '負債變少是好事,應該是綠色');
must(A.itemDeltaText('a1', 120000) === '比上月 持平', `活存改名但金額沒變,應該是持平,得到 ${A.itemDeltaText('a1', 120000)}`);
const hist = A.itemHistory('a2');
must(hist.length === 2 && hist[0].m === '2026-09' && hist[1].amount === 550000, `股票的每月紀錄應該有 9、10 月兩筆:${JSON.stringify(hist)}`);
console.log('  ok');

console.log('中間有沒開 app 的月份:寫出是跟哪個月比,不能說「比上月」');
simNow = new RealDate('2026-12-03T09:00:00').getTime();   // 11 月沒開過
must(A.itemDeltaText('a2', 560000) === '比2026年10月 +10,000', `應該寫比 2026年10月,得到 ${A.itemDeltaText('a2', 560000)}`);
simNow = new RealDate('2026-10-20T09:00:00').getTime();
console.log('  ok');

console.log('新增的項目:上月沒有這項;手動改過的月份不會被自動覆蓋');
A.state.assets.push({ id:'a3', name:'外幣', amount:30000 });
field('aa-a3', 30000);
must(A.itemDeltaText('a3', 30000) === '2026年9月還沒有這項', `新項目應該顯示上月還沒有,得到 ${A.itemDeltaText('a3', 30000)}`);
const octNow = A.state.netWorthHistory.find(h => h.m === '2026-10');
octNow.auto = false;                                     // 使用者手動改過 10 月的淨資產
field('aa-a2', 999999);
must(A.state.netWorthHistory.find(h => h.m === '2026-10').items.find(x => x.id === 'a2').amount === 550000,
     '手動改過的月份,細項也不該被自動覆蓋');
console.log('  ok');

console.log('還開著的舊版分頁把細項/分割記錄丟掉寫回雲端:新版收到時要保留本機的(不然每月細項會永久消失)');
(function(){
  const s2 = A.sampleData();
  s2.netWorthHistory.forEach(h => { h.items = [{ id:'a1', name:'活存', amount: 123, t:'a' }]; });
  s2.instruments[0].splits = [{ d:'2026-03-16', ratio: 1 / 22 }];
  A.state = s2;
  // 模擬舊版寫回來的資料:netWorthHistory 沒有 items 欄位、instruments 沒有 splits 欄位
  const old = JSON.parse(JSON.stringify(s2));
  old.netWorthHistory.forEach(h => { delete h.items; });
  old.instruments.forEach(it => { delete it.splits; });
  old.netWorthHistory[0].v = 42;          // 舊版那邊確實改了別的東西,這個要照收
  A.applyRemote(old);
  must(A.state.netWorthHistory.every(h => h.items.length === 1 && h.items[0].amount === 123), '舊版丟掉的細項應該用本機的補回來');
  must(A.state.netWorthHistory[0].v === 42, '舊版改的其他欄位還是要照收');
  must(A.state.instruments[0].splits.length === 1 && A.state.instruments[0].priceHistory.length > 200, '舊版丟掉 splits 時,本機的分割記錄跟歷史價格要保留,不能被清掉重抓');
  // 新版寫來的資料(有 items 欄位,就算是空的)要照收,不能被本機蓋回去
  const fresh = JSON.parse(JSON.stringify(A.state));
  fresh.netWorthHistory[0].items = [];
  A.applyRemote(fresh);
  must(A.state.netWorthHistory[0].items.length === 0, '新版寫來的資料要照收');
})();
console.log('  ok');

console.log('手機時間被往回調(10 月調回 9 月):已經固定的 9 月快照不能被現在的數字蓋掉');
(function(){
  const s3 = A.emptyState();
  s3.assets = [{ id:'z1', name:'活存', amount:100 }];
  A.state = s3;
  simNow = new RealDate('2026-09-20T09:00:00').getTime();
  A.maybeSnapshot();
  simNow = new RealDate('2026-10-05T09:00:00').getTime();
  field('aa-z1', 200);
  const sepBefore = JSON.stringify(A.state.netWorthHistory.find(h => h.m === '2026-09'));
  simNow = new RealDate('2026-09-28T09:00:00').getTime();
  field('aa-z1', 999);
  must(JSON.stringify(A.state.netWorthHistory.find(h => h.m === '2026-09')) === sepBefore, '時間往回調後,9 月快照被改掉了');
  must(A.state.netWorthHistory.find(h => h.m === '2026-10').items[0].amount === 200, '10 月快照也不該被動到');
  simNow = new RealDate('2026-10-06T09:00:00').getTime();   // 時間調回正確之後恢復正常更新
  field('aa-z1', 300);
  must(A.state.netWorthHistory.find(h => h.m === '2026-10').items[0].amount === 300, '時間恢復正常後,本月快照要照常更新');
})();
console.log('  ok');

console.log('房貸利息自動記入:整個月沒開 app 的月份,下次打開要補記;刪掉的月份不補回來');
(function(){
  const s4 = A.emptyState();
  s4.leverage.autoInterest = true; s4.leverage.annualRate = 2.4; s4.leverage.autoRepay = false;   // 這段只看利息補記;每月還本在 loans.js
  s4.leverage.draws = [{ id:'d1', label:'x', amount:1000000, useDate:'2026-08-15', note:'', repayments:[{ id:'r1', date:'2026-10-20', amount:500000 }] }];
  A.state = s4;
  simNow = new RealDate('2026-09-02T09:00:00').getTime(); A.maybePostInterest();
  simNow = new RealDate('2027-01-10T09:00:00').getTime(); A.maybePostInterest();
  const posted = A.state.leverage.interestPosted.slice().sort().join(',');
  must(posted === '2026-09,2026-10,2026-11,2026-12,2027-01', `中間沒開的月份要補記,得到 ${posted}`);
  const amt = m => (A.state.transactions.find(t => t.date === m + '-01') || {}).amount;
  // 以日計息:10/01 那筆 = 9/01~10/01 30 天 100 萬;11/01 那筆 = 10/01~10/20 19 天 100 萬 + 10/20~11/01 12 天 50 萬
  const e10 = -Math.round(1000000 * 0.024 * 30 / 365), e11 = -Math.round((1000000 * 19 + 500000 * 12) * 0.024 / 365);
  must(amt('2026-10') === e10 && amt('2026-11') === e11, `10/20 還了 50 萬,10、11 月利息應該是 ${e10} / ${e11}:得到 ${amt('2026-10')} / ${amt('2026-11')}`);
  // 使用者刪掉 12 月那筆,不能再補回來
  A.state.transactions = A.state.transactions.filter(t => t.date !== '2026-12-01');
  simNow = new RealDate('2027-02-03T09:00:00').getTime(); A.maybePostInterest();
  must(!A.state.transactions.some(t => t.date === '2026-12-01'), '使用者刪掉的月份不該被補回來');
  must(A.state.transactions.some(t => t.date === '2027-02-01'), '新的月份要照常記入');
  must(A.state.transactions.filter(t => t.date === '2026-10-01').length === 1, '同一個月不能記兩次');

  // 使用者關掉自動記入一段時間(自己手動記),重新打開時不能把關掉期間補記回來
  A.onClick({ dataset: { act: 'toggle-autointerest' } });          // 2027-02 關掉
  simNow = new RealDate('2027-05-04T09:00:00').getTime();
  A.onClick({ dataset: { act: 'toggle-autointerest' } });          // 2027-05 打開
  must(!['2027-03-01', '2027-04-01'].some(d => A.state.transactions.some(t => t.date === d)), '關掉期間(3、4 月)不該被補記');
  must(A.state.transactions.some(t => t.date === '2027-05-01'), '重新打開的當月要記入');
  // 更早的歷史空檔也不回頭補(可能是刻意關掉的)
  const s5 = A.emptyState();
  s5.leverage.autoInterest = true; s5.leverage.annualRate = 2.4;
  s5.leverage.draws = [{ id:'d1', label:'x', amount:1000000, useDate:'2025-01-15', note:'', repayments:[] }];
  s5.leverage.interestPosted = ['2025-02', '2025-06'];            // 3~5 月是空檔
  A.state = s5;
  simNow = new RealDate('2025-07-02T09:00:00').getTime(); A.maybePostInterest();
  must(!A.state.transactions.some(t => t.date === '2025-03-01'), '最近一次記入之前的歷史空檔不該回頭補');
  must(A.state.transactions.some(t => t.date === '2025-07-01'), '本月要記入');
})();
console.log('  ok');

console.log('舊資料(沒有細項的月份)讀得進來,不會出錯,也不會被當成「上月」');
const old = A.normalize({ assets: [{ id:'a1', name:'活存', amount:1 }],
  netWorthHistory: [{ id:'h1', m:'2026-08', v:100 }, { id:'h2', m:'2026-09', v:200, items:[{ id:'a1', name:'活存', amount:50, t:'a' }, { name:'沒有 id' }] }] });
must(Array.isArray(old.netWorthHistory[0].items) && old.netWorthHistory[0].items.length === 0, '舊月份的 items 應該是空陣列');
must(old.netWorthHistory[1].items.length === 1, '沒有 id 的細項應該被濾掉');
A.state = old;
simNow = new RealDate('2026-09-10T09:00:00').getTime();
must(A.prevItemAmount('a1') === null, '上個月(8 月)沒有細項紀錄,不該算得出比上月');
must(typeof A.renderAssets() === 'string', '資產頁要畫得出來');
console.log('  ok');

console.log('資產頁「每月紀錄」可以改過去月份的細項,那個月的淨資產跟著重算;本月的不能在這裡改');
(function testEditPastItem(){
  const s = A.emptyState();
  s.assets = [{ id:'a1', name:'活存', amount:100000 }, { id:'a2', name:'股票', amount:500000 }];
  s.liabilities = [{ id:'l1', name:'房貸', amount:300000 }];
  A.state = s;
  simNow = new RealDate('2026-08-10T09:00:00').getTime(); A.maybeSnapshot();
  simNow = new RealDate('2026-09-10T09:00:00').getTime(); A.maybeSnapshot();
  const aug = () => A.state.netWorthHistory.find(h => h.m === '2026-08'), sep = () => A.state.netWorthHistory.find(h => h.m === '2026-09');
  must(aug().v === 300000 && aug().auto === true, `8 月快照一開始應該是 300000(自動),得到 ${aug().v}`);
  // 8 月活存當時其實是 150000(填錯了),改過去月份
  field(`ih-${aug().id}.a1`, 150000);
  must(aug().items.find(x => x.id === 'a1').amount === 150000, '8 月活存應該改成 150000');
  must(aug().v === 350000, `8 月淨資產要跟著重算成 150000 + 500000 − 300000 = 350000,得到 ${aug().v}`);
  must(aug().auto === false, '改過的月份要標成手動');
  // 負債也能改,淨資產往反方向動
  field(`ih-${aug().id}.l1`, 400000);
  must(aug().v === 250000, `8 月房貸改成 400000 後淨資產應該是 250000,得到 ${aug().v}`);
  // 本月快照、目前的資產都不受影響
  must(sep().v === 300000 && A.state.assets.find(a => a.id === 'a1').amount === 100000, '改 8 月不能動到 9 月快照或目前的金額');
  // 清空欄位準備重打的那一下不算;負數夾成 0
  field(`ih-${aug().id}.a1`, '');
  must(aug().items.find(x => x.id === 'a1').amount === 150000, '清空欄位的那一下不該把金額變成 0');
  field(`ih-${aug().id}.a1`, -5);
  must(aug().items.find(x => x.id === 'a1').amount === 0 && aug().v === 100000, `負數要夾成 0,淨資產 0 + 500000 − 400000 = 100000,得到 ${aug().v}`);
  // 本月的細項不能從這裡改(它跟著目前的金額自動更新)
  field(`ih-${sep().id}.a1`, 999);
  must(sep().items.find(x => x.id === 'a1').amount === 100000 && sep().v === 300000, '本月的細項不該從每月紀錄改');
  // 不存在的 id、壞掉的 key 不會出錯
  field('ih-nope.a1', 1); field(`ih-${aug().id}.nope`, 1); field('ih-noDot', 1);
  // 比上月跟著過去月份的新數字算
  must(A.itemDeltaText('a1', 100000) === '比上月 +100,000', `9 月活存 100000 比 8 月(改成 0)應該是 +100,000,得到 ${A.itemDeltaText('a1', 100000)}`);
  // 畫面:過去月份是輸入框、本月是文字
  A.itemHistOpen = 'a1';
  const html = A.renderAssets();
  must(html.includes(`data-k="ih-${aug().id}.a1"`) && !html.includes(`data-k="ih-${sep().id}.a1"`), '過去月份要有輸入框、本月不該有');
  must(html.includes('本月,自動'), '本月那一行要標「自動」');
  A.itemHistOpen = '';
  // 過了月份之後,自動快照不會蓋掉改過的 8 月
  simNow = new RealDate('2026-10-02T09:00:00').getTime(); A.maybeSnapshot();
  must(aug().items.find(x => x.id === 'a1').amount === 0 && aug().v === 100000, '跨月之後改過的 8 月不能被自動快照覆蓋');
  // normalize 來回一次(存檔、重開)還是一樣
  const back = A.normalize(JSON.parse(JSON.stringify(A.state)));
  const aug2 = back.netWorthHistory.find(h => h.m === '2026-08');
  must(aug2.v === 100000 && aug2.items.find(x => x.id === 'l1').amount === 400000, '存檔重開之後改過的數字要還在');
})();
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);
