#!/usr/bin/env bash
# 跑完整測試。改完 app.template.html 之後先 python3 build.py 再跑這個。
set -u
set -o pipefail   # 下面有些測試接 | tail 截短輸出,不加這個的話測試失敗的結束碼會被 tail 吃掉
cd "$(dirname "$0")"
fail=0

echo "=== 功能測試(三個版本) ==="
for f in ../finance_app.html ../finance_app_artifact.html ../docs/index.html; do
  sed -i "s#const src = fs.readFileSync('[^']*'#const src = fs.readFileSync('$(cd .. && pwd)/${f#../}'#" smoke.js
  printf '%-28s ' "${f#../}"
  if node smoke.js >/dev/null 2>&1; then echo OK; else echo FAIL; fail=1; node smoke.js 2>&1 | grep -E '^Error' | head -1; fi
done

echo
echo "=== 均線趨勢訊號(computeTrend) ==="
node trend.js || fail=1
echo
echo "=== 均線策略回測(runBacktest) ==="
node backtest.js || fail=1
echo
echo "=== 加權指數模擬正2(可拆) ==="
node indexsim.js | tail -1 || fail=1
echo
echo "=== 新版提示(checkForUpdate) ==="
node update.js || fail=1
echo
echo "=== 資產/負債細項每月留存 ==="
node items.js || fail=1
echo
echo "=== 計算正確性(隨機 400 組:會計恆等式、XIRR 是真的解、同日買賣順序) ==="
node semantic.js || fail=1
echo
echo "=== 照建議實際操作再重算(曝險目標、壓力測試) ==="
node oracle.js || fail=1
echo
echo "=== 照策略嚴格執行 1000 天(提醒不漏、照卡片做完回到目標) ==="
node execution.js || fail=1
echo
echo "=== 手機放在背景,隔天切回來 ==="
node foreground.js || fail=1
echo
echo "=== 瀏覽器空間快滿 ==="
node storage.js || fail=1
echo
echo "=== 隨機操作壓力測試(3 組 × 800 步) ==="
node fuzz.js 800 || fail=1
echo
echo "=== 邊界情況 ==="
node hunt.js || fail=1
echo
echo "=== 壞掉的匯入資料(型別錯亂隨機 2 組 × 150) ==="
node malformed.js || fail=1
echo
echo "=== 圖表(各種資料形狀與點擊) ==="
node charts.js | tail -3 || fail=1
echo
echo "=== 雲端同步(假後端) ==="
node cloud.js | tail -3 || fail=1
echo
echo "=== 離線時記的帳,關掉再打開 ==="
node offline.js | tail -1 || fail=1
echo
echo "=== 說明頁與程式是否一致 ==="
node help.js | tail -2 || fail=1
echo
echo "=== id 與樣板完整性 ==="
node ids.js | tail -2 || fail=1
node stress-live.js | tail -1 || fail=1
echo
echo "=== 15 年長期使用 ==="
node longrun.js | tail -10 || fail=1

exit $fail
