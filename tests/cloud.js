const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
let focused = null;
global.document = { get activeElement(){ return focused; },
  getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
global.fetch = async () => { throw new Error('offline'); };

// ---- 假雲端 ----
const cloudDocs = {};
let snapCb = null, writeLog = [], failNextWrite = false;
const mkDoc = (path) => ({
  async get(){ return { exists: cloudDocs[path] !== undefined,
                        data: () => JSON.parse(JSON.stringify(cloudDocs[path])) }; },
  async set(d){
    if (failNextWrite){ failNextWrite = false; throw { code:'unavailable', message:'寫入失敗' }; }
    cloudDocs[path] = JSON.parse(JSON.stringify(d));
    writeLog.push(path);
  },
  async delete(){ delete cloudDocs[path]; },
  onSnapshot(cb){ if (path === 'state/finance') snapCb = cb; return () => {}; }
});
const db = {
  doc: mkDoc,
  collection: (c) => ({ async get(){
    return { docs: Object.keys(cloudDocs).filter(k => k.indexOf(c + '/') === 0)
      .map(k => ({ id: k.slice(c.length + 1) })) };
  }})
};
global.window = { claude: { use: async (n) => (n === 'db' ? db : null) } };

const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/finance_app_artifact.html','utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A = {
  get state(){return state}, set state(v){state=v},
  get storageMode(){return storageMode}, get lastPushed(){return lastPushed},
  get pendingRemote(){return pendingRemote},
  connectCloud, save, onRemote, applyRemote, scheduleSave, maybeBackup, emptyState, sampleData, normalize, renderAll,
  importJSON, todayISO, shiftMonth
};`);

const bugs = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1) 雲端已有資料 → 應該拉下來覆蓋本機
  cloudDocs['state/finance'] = { version:2, assets:[{id:'x', name:'雲端來的', amount:123}],
    liabilities:[], trades:[], transactions:[], netWorthHistory:[], budgets:[], instruments:[] };
  await A.maybeBackup();            // 開 app 4 秒後的那次:還沒連上雲端,存成本機備份
  await A.connectCloud();
  await wait(30);
  // 雲端連上之後那天也要有一份雲端備份(以前本機那次記了「今天做過了」,雲端就被跳過)
  if (!cloudDocs['backups/' + A.todayISO()]) bugs.push('先做了本機備份,連上雲端後當天的雲端備份被跳過');
  console.log('1. 首次連線:', A.storageMode, '| 資產', A.state.assets.map(a=>a.name).join(','));
  if (A.state.assets[0].name !== '雲端來的') bugs.push('首次連線沒有把雲端資料拉下來');

  // 2) 自己寫上去的變更,不該被 onSnapshot 當成別人的改動再套用一次
  A.state.assets[0].amount = 999;
  await A.save();
  const pushed = A.lastPushed;
  snapCb({ exists:true, data: () => JSON.parse(JSON.stringify(cloudDocs['state/finance'])) });
  await wait(10);
  console.log('2. 自己的寫入回音:資產金額', A.state.assets[0].amount);
  if (A.state.assets[0].amount !== 999) bugs.push('自己寫的資料被回音蓋掉');

  // 3) 別台裝置改了 → 應該套用
  cloudDocs['state/finance'].assets[0].name = '另一台改的';
  snapCb({ exists:true, data: () => JSON.parse(JSON.stringify(cloudDocs['state/finance'])) });
  await wait(10);
  console.log('3. 別台的改動:', A.state.assets[0].name);
  if (A.state.assets[0].name !== '另一台改的') bugs.push('別台裝置的改動沒有套用');

  // 4) 正在打字時,遠端改動要先擱著
  focused = { tagName:'INPUT' };
  cloudDocs['state/finance'].assets[0].name = '打字中來的';
  snapCb({ exists:true, data: () => JSON.parse(JSON.stringify(cloudDocs['state/finance'])) });
  await wait(10);
  const held = A.state.assets[0].name !== '打字中來的' && A.pendingRemote;
  console.log('4. 打字中:先擱著?', !!held);
  if (!held) bugs.push('打字時遠端資料直接覆蓋,會把輸入到一半的內容洗掉');

  // 4b) 擱著的遠端改動在離開欄位時套用:本機剛打的、剛按的都不能被整份蓋掉
  //     遠端:改了資產名稱、自動記了一筆利息(交易 + interestPosted);本機:改了同一筆資產的金額、新增一筆交易、刪掉一筆交易
  {
    const pend = A.pendingRemote;
    pend.transactions = (pend.transactions || []).concat({ id:'rint', date:'2026-09-01', cat:'房貸利息', desc:'自動', amount:-100 });
    pend.leverage = Object.assign({}, pend.leverage, { interestPosted: ['2026-09'] });
    A.state.assets[0].amount = 4321;
    A.state.transactions.push({ id:'ltx', date:'2026-09-02', cat:'餐飲', desc:'本機', amount:-50 });
    A.scheduleSave();
    focused = null;
    A.applyRemote(pend);
    const st = A.state;
    const got = { name: st.assets[0].name, amount: st.assets[0].amount, tx: st.transactions.map(t => t.id).sort().join(','), posted: (st.leverage.interestPosted || []).join(',') };
    console.log('4b. 離開欄位套用遠端:', JSON.stringify(got));
    if (got.name !== '打字中來的') bugs.push('遠端改的資產名稱沒套用');
    if (got.amount !== 4321) bugs.push('本機剛打的金額被遠端蓋掉(' + got.amount + ')');
    if (!got.tx.includes('rint') || !got.tx.includes('ltx')) bugs.push('兩邊各自新增的交易沒有都留下:' + got.tx);
    if (got.posted !== '2026-09') bugs.push('遠端記過的利息月份不見了');
    await wait(500);
    const cd = cloudDocs['state/finance'];
    if (!cd.transactions.some(t => t.id === 'ltx') || cd.assets[0].amount !== 4321) bugs.push('合併後的結果沒有推回雲端');
    // 本機刪掉一筆,雲端那邊沒動它:要維持刪掉
    A.state.transactions = A.state.transactions.filter(t => t.id !== 'ltx');
    A.scheduleSave();
    const remote2 = JSON.parse(JSON.stringify(cloudDocs['state/finance']));
    remote2.liabilities = [{ id:'rl', name:'遠端新增的負債', amount:10 }];
    A.applyRemote(remote2);
    if (A.state.transactions.some(t => t.id === 'ltx')) bugs.push('本機刪掉的交易被遠端那份加回來');
    if (!A.state.liabilities.some(l => l.id === 'rl')) bugs.push('遠端新增的負債沒套用');
    await wait(500);
  }

  // 5) 雲端寫入失敗 → 本機要留得住,狀態要誠實
  failNextWrite = true;
  A.state.assets[0].amount = 555;
  await A.save();
  const local = JSON.parse(localStorage.getItem('financeAppState_v2'));
  console.log('5. 雲端寫入失敗:模式', A.storageMode, '| 本機金額', local.assets[0].amount);
  if (local.assets[0].amount !== 555) bugs.push('雲端失敗時本機也沒存到');
  if (A.storageMode === 'cloud') bugs.push('雲端寫入失敗卻還顯示已同步');

  // 6) 匯入不相干的 JSON → 不該把資料清光
  A.state = A.sampleData();
  const before = A.state.transactions.length;
  const fakeFile = { name:'亂入.json' };
  global.FileReader = function(){
    this.readAsText = () => { this.result = JSON.stringify({ hello:'world', items:[1,2,3] });
                              this.onload && this.onload(); };
  };
  A.importJSON(fakeFile);
  await wait(10);
  console.log('6. 匯入不相干的 JSON:交易剩', A.state.transactions.length, '筆(原本', before, '筆)');
  if (A.state.transactions.length !== before) bugs.push('匯入不相干的檔案就把資料清光了');

  // 6b) 匯入真的備份要成功
  global.FileReader = function(){
    this.readAsText = () => { this.result = JSON.stringify({ version:2, assets:[{id:'z',name:'還原的',amount:7}],
      liabilities:[], trades:[], transactions:[], netWorthHistory:[], budgets:[], instruments:[] });
      this.onload && this.onload(); };
  };
  A.importJSON({ name:'finance-2026-09-08.json' });
  await wait(10);
  console.log('6b. 匯入真的備份:資產', A.state.assets.map(a=>a.name).join(','));
  if (A.state.assets[0] === undefined || A.state.assets[0].name !== '還原的') bugs.push('正常的備份匯入不進來');

  // 6c) 雲端那份壞掉時不該蓋掉本機
  A.state = A.sampleData();
  const keep = A.state.transactions.length;
  A.onRemote({ hello:'world' });
  console.log('6c. 收到壞掉的雲端資料:交易剩', A.state.transactions.length, '筆');
  if (A.state.transactions.length !== keep) bugs.push('壞掉的雲端資料把本機蓋掉了');

  // 8) 連續存了兩次(A、B),A 的回音延遲到 B 之後才到 → 不能把狀態倒回 A(B 的修改會被弄丟)
  A.state = A.sampleData();
  A.state.assets[0].amount = 111;
  await A.save();
  const echoA = JSON.parse(JSON.stringify(cloudDocs['state/finance']));
  A.state.assets[0].amount = 222;
  await A.save();
  snapCb({ exists:true, data: () => JSON.parse(JSON.stringify(echoA)) });   // 遲到的舊回音
  await wait(10);
  console.log('8. 舊回音遲到:資產金額', A.state.assets[0].amount, '(應該還是 222)');
  if (A.state.assets[0].amount !== 222) bugs.push('自己較早一次寫入的回音遲到,把狀態倒回去了(後來的修改會被弄丟)');

  // 7) 跨年的月份運算
  const ym = ['2026-01','2026-12'];
  console.log('7. 月份運算:', ym[0], '往前一個月 =', A.shiftMonth(ym[0], -1),
              '|', ym[1], '往後一個月 =', A.shiftMonth(ym[1], 1));
  if (A.shiftMonth('2026-01', -1) !== '2025-12') bugs.push('跨年往前算錯');
  if (A.shiftMonth('2026-12', 1) !== '2027-01') bugs.push('跨年往後算錯');

  console.log();
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n')
                          : '沒有發現問題');
  if (bugs.length) process.exitCode = 1;
})();
