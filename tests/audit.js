const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
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
globalThis.A = { get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  set levTab(v){levTab=v}, renderAll, sampleData, maybeDailySnapshot };`);

A.state = A.sampleData();
// 補幾天的日線,讓圖畫得出來
for (let i = 1; i <= 40; i++){
  const d = new Date(2026, 7, i);
  A.state.dailyHistory.push({ d: '2026-08-' + String(i).padStart(2,'0'),
    pv: 900000 + i * 900, loan: 1000000, eq: -100000 + i * 900, pnl: 50000 + i * 400 });
}
A.currentTab = 'leverage';

['overview','signal','log','setup'].forEach(t => {
  A.levTab = t;
  A.renderAll();
  const h = store.content.innerHTML;
  const count = (re) => (h.match(re) || []).length;
  const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('【' + t + '】');
  console.log('  卡片 ' + count(/class="card"/g) +
              ' | 大字 ' + count(/class="big-num/g) +
              ' | 明細列 ' + count(/class="row"/g) +
              ' | 圖 ' + count(/<svg/g) +
              ' | 範圍切換 ' + count(/data-act="range"/g) / 4 +
              ' | 輸入框 ' + count(/<input/g) +
              ' | 按鈕 ' + count(/<button/g));
  console.log('  說明文字 ' + count(/class="muted"/g) + ' 段 + notice ' + count(/class="notice"/g) +
              ' 段,純文字共 ' + text.length + ' 字');
  const h3 = [...h.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(m => m[1]);
  console.log('  卡片:', h3.join(' / '));
  const notices = [...h.matchAll(/class="notice"[^>]*>([\s\S]*?)<\/div>/g)]
    .map(m => m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
  notices.forEach(n => console.log('    notice(' + n.length + '字):', n.slice(0, 70) + (n.length>70?'…':'')));
});
