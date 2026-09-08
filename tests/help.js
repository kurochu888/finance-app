/* 說明頁對照:文件裡寫的數字與位置,必須跟程式的實際行為一致 */
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
const appJs = blocks.sort((a,b)=>b.length-a.length)[0];
eval(appJs + `
globalThis.A = { get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  set levTab(v){levTab=v}, renderAll, emptyState, sampleData, defaultFee, DAILY_KEEP_:DAILY_KEEP,
  BACKUP_KEEP_:BACKUP_KEEP, LOCAL_BACKUP_KEEP_:LOCAL_BACKUP_KEEP };`);

A.state = A.emptyState();
A.currentTab = 'help';
A.renderAll();
const doc = store.content.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

console.log('文件與程式對照:');
// 手續費
const fee = A.defaultFee('buy', 1000000);
must(doc.includes('0.1425%'), '手續費率沒寫在說明裡');
must(Math.abs(fee - 1000000 * 0.001425) < 1, '說明寫 0.1425%,程式算出來是 ' + (fee / 1000000 * 100).toFixed(4) + '%');
must(A.defaultFee('buy', 1000) === 20 && doc.includes('最低 20 元'), '最低手續費不一致');
console.log('  手續費 0.1425% / 最低 20 元 ✓');

// 賣出證交稅
const sellFee = A.defaultFee('sell', 1000000);
must(Math.abs(sellFee - (1000000 * 0.001425 + 1000000 * 0.001)) < 1, '賣出證交稅與說明不符');
must(doc.includes('0.1% 證交稅'), '證交稅沒寫在說明裡');
console.log('  賣出加 0.1% 證交稅 ✓');

// 撤退門檻 8%
must(appJs.includes('accrue(t, 8)'), '程式的撤退門檻累加率不是 8%');
must(doc.includes('8%'), '說明沒寫 8%');
console.log('  撤退門檻每年 8% ✓');

// 快照與備份份數
must(A.DAILY_KEEP_ === 1000 && doc.includes('1000 個交易日'), '每日快照上限與說明不符(程式 ' + A.DAILY_KEEP_ + ')');
must(A.BACKUP_KEEP_ === 30 && doc.includes('雲端留 30 份'), '雲端備份份數與說明不符(程式 ' + A.BACKUP_KEEP_ + ')');
must(A.LOCAL_BACKUP_KEEP_ === 7 && doc.includes('一般 7 份'), '本機備份份數與說明不符(程式 ' + A.LOCAL_BACKUP_KEEP_ + ')');
must(doc.includes('150KB') && doc.includes('300KB') && appJs.includes('sizeKB > 300') && appJs.includes('sizeKB > 150'),
     '本機備份的遞減門檻與說明不符');
console.log('  每日快照 1000 天 / 雲端 30 份 / 本機 7-5-3 份 ✓');

// 報價過期天數與空間提醒
must(appJs.includes('daysSince(L.quoteDate) > 5') && doc.includes('5 天'), '報價過期天數與說明不符');
must(appJs.includes('localUsageRatio() > 0.75') && doc.includes('75%'), '空間提醒門檻與說明不符');
console.log('  報價過期 5 天 / 空間提醒 75% ✓');

// 提到的位置要真的存在
A.state = A.sampleData();
A.currentTab = 'leverage';
const where = {};
['overview','signal','log','setup'].forEach(t => {
  A.levTab = t; A.renderAll();
  where[t] = store.content.innerHTML;
});
must(where.log.includes('記一筆還款'), '說明說還款在「紀錄」分頁,實際找不到');
must(!where.signal.includes('記一筆還款'), '還款不該出現在「訊號」分頁');
must(where.setup.includes('持股與報價'), '說明說持股與報價在「設定」分頁,實際找不到');
must(where.setup.includes('桶金設定'), '說明說桶金設定在「設定」分頁,實際找不到');
must(where.setup.includes('撤退門檻設定'), '說明說撤退門檻設定在「設定」分頁,實際找不到');
console.log('  說明提到的分頁位置都對得上 ✓');

// 提醒文案要與實際訊息一致
[['兩邊的房貸金額對不起來', appJs], ['有一筆賣出超過當時的持股', appJs],
 ['代號和上面某一列重複了', appJs]].forEach(([phrase, hay]) => {
  must(hay.includes(phrase), '說明列出的提醒「' + phrase + '」在程式裡找不到對應訊息');
});
console.log('  說明列出的畫面提醒都存在於程式 ✓');

console.log();
console.log(bugs.length ? '文件與程式不一致:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '說明頁與程式一致');
process.exit(bugs.length ? 1 : 0);
