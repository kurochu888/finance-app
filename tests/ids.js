/* 重構後的檢查:重複的 id、局部更新找不到的 id、模板破損 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
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
const appJs = blocks.sort((a,b)=>b.length-a.length)[0];
eval(appJs + `
globalThis.A = { get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  set levTab(v){levTab=v}, renderAll, sampleData, emptyState, maybeDailySnapshot, refreshLeverage };`);

const bugs = [];
A.state = A.sampleData();
A.state.leverage.tranches[0].useDate = '2026-08-05';
A.state.leverage.core.useDate = '2026-07-01';
A.state.leverage.tranches[0].repayments = [{ id:'r1', date:'2026-08-20', amount:200000 }];
for (let i = 1; i <= 5; i++)
  A.state.dailyHistory.push({ d:'2026-09-0' + i, pv:900000+i*1000, loan:1000000, eq:-100000+i*1000, pnl:40000+i*500 });

const rendered = {};
['overview','signal','trend','log','setup'].forEach(t => {
  A.currentTab = 'leverage'; A.levTab = t;
  A.renderAll();
  const h = store.content.innerHTML;
  rendered[t] = h;

  // 同一畫面不能有重複的 id
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) bugs.push(t + ':重複的 id → ' + [...new Set(dup)].join(', '));

  // 模板破損的跡象
  ['${', '` : `', 'undefined', 'NaN', '[object Object]'].forEach(bad => {
    if (h.includes(bad)) bugs.push(t + ':輸出含有「' + bad + '」,樣板可能破損');
  });
  const open = (h.match(/<div/g)||[]).length, close = (h.match(/<\/div>/g)||[]).length;
  if (open !== close) bugs.push(t + ':<div> 開合不符(' + open + ' vs ' + close + ')');
});

// refreshLeverage 會去更新的 id,在對應分頁必須存在
const dynamic = [...appJs.matchAll(/set\('([\w-]+)' \+ /g)].map(m => m[1]);
// refreshLeverage 裡的固定 id(動態前綴另外驗),資產頁的 refreshAssets 不在此列
const refreshFn = appJs.slice(appJs.indexOf('function refreshLeverage('),
                              appJs.indexOf('function refreshLeverage(') + 2200);
const refreshIds = [...refreshFn.matchAll(/set\('([a-z][\w-]*)'\s*,/gi)].map(m => m[1])
  .concat([...refreshFn.matchAll(/getElementById\('([\w-]+)'/g)].map(m => m[1]))
  .filter(id => !dynamic.includes(id) && !id.endsWith('-'));   // 結尾是 - 的是動態前綴
const allHtml = Object.values(rendered).join('');
const missing = [...new Set(refreshIds)].filter(id => !allHtml.includes('id="' + id + '"'));
if (missing.length) bugs.push('局部更新會找不到這些 id:' + missing.join(', '));
console.log('refreshLeverage 更新的固定 id:', [...new Set(refreshIds)].join(', '));
console.log('動態前綴:', [...new Set(dynamic)].join(', '));
// 動態前綴至少要各出現一次
const prefixes = [...new Set(dynamic)].concat(
  [...refreshFn.matchAll(/getElementById\('([\w-]+-)' \+/g)].map(m => m[1]));
[...new Set(prefixes)].filter(pre => pre.startsWith('out-')).forEach(pre => {
  if (!allHtml.includes('id="' + pre)) bugs.push('動態 id 前綴 ' + pre + ' 在畫面上找不到');
});
console.log('都存在?', missing.length ? '否 → ' + missing.join(', ') : '是');

// 切到訊號分頁後呼叫 refreshLeverage 不能爆
A.levTab = 'signal'; A.renderAll();
try { A.refreshLeverage(); console.log('訊號分頁 refreshLeverage:正常'); }
catch(e){ bugs.push('訊號分頁 refreshLeverage 發生例外:' + e.message); }
A.levTab = 'setup'; A.renderAll();
try { A.refreshLeverage(); console.log('設定分頁 refreshLeverage:正常'); }
catch(e){ bugs.push('設定分頁 refreshLeverage 發生例外:' + e.message); }

console.log();
console.log(bugs.length ? '發現問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
