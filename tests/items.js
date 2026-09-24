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
  onField, onClick, prevItemAmount, itemHistory, itemDeltaText, itemDeltaClass, renderAssets, applyRemote, sampleData };`);

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

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);
