const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:{tagName:'INPUT'}, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs=require('fs');
const src=fs.readFileSync('/ssd1/finance/docs/index.html','utf8');
const blocks=[...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A={ get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  set levTab(v){levTab=v}, renderAll, sampleData, onField };`);
A.state = A.sampleData();
A.state.leverage.tranches[0].useDate='2026-08-05';
A.currentTab='leverage'; A.levTab='signal';
A.renderAll();
// stress-body 只存在於畫出來的 HTML 裡,直接從內容抓
const grab = () => {
  const h = store.content.innerHTML;
  const i = h.indexOf('id="stress-body"');
  if (i < 0) throw new Error('畫面上沒有 stress-body');
  return (h.slice(i, i + 900).match(/−NT\$ ([\d,]+)/) || [])[1];
};
const grabLive = () => {
  const node = store['stress-body'];
  return node && node.innerHTML ? (node.innerHTML.match(/−NT\$ ([\d,]+)/) || [])[1] : null;
};
console.log('跌 20% →', grab());
A.onField('lev-stressDeclinePct', { value:'40' });   // 模擬打字中(activeElement 是 INPUT)
console.log('改成 40%(打字中,只局部更新)→', grabLive());
if (!grabLive()) throw new Error('打字時壓力測試沒有即時更新');
console.log('即時更新正常 ✓');
