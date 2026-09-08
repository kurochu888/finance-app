/* 圖表壓測:各種資料形狀都要畫得出來、座標不能跑出畫布,點下去要看得到數值 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){},
  closest(){return null;}, _attrs:{}, setAttribute(k,v){this._attrs[k]=v;}, getAttribute(k){return this._attrs[k];} });
const store = {};
const nodes = [];
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:(sel)=>{ const out = nodes.filter(n => n.sel === sel); return out; },
  querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html','utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A = { lineChart, chartCaption, pickChartPoint, get chartData(){return chartData}, onClick };`);

const bugs = [];
const W = 320;

function checkSvg(name, svg, expectPoints){
  if (!svg){ bugs.push(name + ':沒有畫出圖'); return; }
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb){ bugs.push(name + ':沒有 viewBox'); return; }
  const [w, h] = [Number(vb[1]), Number(vb[2])];
  // 所有座標必須是有限數字且落在畫布內
  const coords = [...svg.matchAll(/[ML] ?([\d.]+),([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const circles = [...svg.matchAll(/cx="([\d.-]+)" cy="([\d.-]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  const all = coords.concat(circles);
  if (!all.length){ bugs.push(name + ':圖裡沒有任何線或點'); return; }
  const bad = all.filter(([x, y]) => !isFinite(x) || !isFinite(y) || x < -1 || x > w + 1 || y < -1 || y > h + 1);
  if (bad.length) bugs.push(name + ':有 ' + bad.length + ' 個座標跑出畫布,例如 ' + JSON.stringify(bad[0]));
  if (svg.includes('NaN')) bugs.push(name + ':座標出現 NaN');
  const hits = (svg.match(/data-act="chart"/g) || []).length;
  if (expectPoints && hits !== expectPoints) bugs.push(name + ':可點區域 ' + hits + ' 個,應為 ' + expectPoints);
  return { w, h, points: all.length, hits };
}

const mk = (n, f) => Array.from({ length:n }, (_, i) => f(i));
const labels = n => mk(n, i => (i % 12 + 1) + '/' + (i % 28 + 1));

console.log('各種資料形狀:');
[
  ['兩個點',        2,  i => 100 + i * 50],
  ['一年 250 點',   250, i => 1000000 + Math.sin(i/9) * 200000],
  ['滿載 1000 點',  1000, i => 500000 + i * 137 + Math.sin(i/3) * 90000],
  ['全部一樣',      50, () => 777777],
  ['含負數',        60, i => -500000 + i * 20000],
  ['極大數字',      40, i => 9e9 + i * 1e8],
  ['極小數字',      40, i => 0.0001 * i],
  ['有缺洞',        80, i => (i % 7 === 0 ? null : 100000 + i * 900)]
].forEach(([name, n, f]) => {
  const svg = A.lineChart('t_' + name, labels(n), [{ name:'測試', color:'var(--s1)', values: mk(n, f) }], { zero:true });
  const r = checkSvg(name, svg, n);
  if (r) console.log('  ' + name.padEnd(12), r.points + ' 個座標,' + r.hits + ' 個可點區域,畫布 ' + r.w + '×' + r.h);
});

console.log('\n兩條線(市值 + 借款):');
const n2 = 300;
const svg2 = A.lineChart('two', labels(n2), [
  { name:'部位市值', color:'var(--s1)', values: mk(n2, i => 3000000 + Math.sin(i/20) * 900000) },
  { name:'借款餘額', color:'var(--s2)', values: mk(n2, i => i < 100 ? 0 : 1000000) }
], {});
const r2 = checkSvg('兩條線', svg2, n2);
if (r2) console.log('  ' + r2.points + ' 個座標,' + r2.hits + ' 個可點區域');

console.log('\n點下去看得到數值嗎:');
const capId = 'cap-two';
const before = A.chartCaption('two', n2 - 1);
A.onClick({ dataset: { act:'chart', key:'two', i:'42' } });
const after = store[capId] ? store[capId].innerHTML : '';
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
console.log('  預設(最新一點):', plain(before).slice(0, 52));
console.log('  點第 42 點之後 :', plain(after).slice(0, 52));
if (!after) bugs.push('點了之後說明列沒有更新');
else if (plain(after) === plain(before)) bugs.push('點不同的點,顯示的數值沒變');
const mk2 = store['mk-two'];
console.log('  游標線位置:', mk2 && mk2.getAttribute('x1'), '| 透明度:', mk2 && mk2.getAttribute('opacity'));
if (!mk2 || mk2.getAttribute('opacity') !== '1') bugs.push('游標線沒有顯示');

console.log();
console.log(bugs.length ? '發現問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
