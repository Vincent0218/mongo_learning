# 驗證紀錄

本次驗證日期：2026-09-05。這是當次本機結果，不代表不同版本、正式負載或 Search 部署也已驗證。

## 環境與結果

Windows PowerShell、Docker Desktop Linux containers、MongoDB 7.0.30。基礎環境位於 27017，單節點 rs0 位於 27018。使用 Python 3.12.11、Go 1.26.0、.NET SDK 10.0.111（目標框架 net8.0）。

| 檢查 | 結果 |
| --- | --- |
| Compose 設定、健康檢查、replica set 初始化及重跑 | 通過 |
| seed 連續重跑 | 固定商品 4、使用者 2、訂單 4，未增加重複文件 |
| mongosh CRUD、null／missing、負庫存防護、regex | 通過 |
| 1 月排行榜 | 營收 1497000／990000／320000 分；銷量 3／1／1 |
| 索引比較 | 前後均回傳 10 筆；文件掃描由 10000 降為 10，建索引後掃描 10 個鍵 |
| Python | 同步 CRUD、Async 讀取、ObjectId 驗證及交易測試通過 |
| Go | 建置、CRUD、七個交易子案例通過 |
| C# | 建置零警告／錯誤，CRUD 與七個交易案例通過 |
| Schema validation | 正確資料寫入成功，字串價格／負庫存範例被拒絕 |
| 備份還原 | 10010 筆文件還原至獨立資料庫，當時的文件與索引比較通過 |
| 一鍵檢查 scripts/verify.ps1 | 通過，命令失敗即停止 |
| MkDocs strict build、Git diff whitespace | 通過 |

三種語言皆測試：成功、餘額不足、轉出帳戶不存在、轉入帳戶不存在、零金額、負金額、同帳戶。成功時兩端為 7500／7500；拒絕後為 10000／5000。

## 尚未實測的項目

- Search：已檢查三份索引 JSON、欄位映射與三維向量設定；沒有相容 Search 連線，因此全文、autocomplete、wildcard 與 vectorSearch 尚未做端到端測試。依[搜尋章](04-atlas-search.md)建立索引後執行 checks.js。
- 畫面：沒有可用的瀏覽器連線。HTML 已確認程式碼引用展開、語言頁籤及 Mermaid 區塊存在；尚未目視驗證圖表渲染、深淺色與窄螢幕版面。
- 多節點 failover、分片負載與正式環境備份一致性不在這次本機驗證範圍。

## 保留的本機狀態

教學服務與本機網站已啟動。教學資料保留於獨立的 Compose volumes；還原演練資料庫為 mongo_learning_restore_check，備份檔為專案根目錄 mongo-learning-lab.archive（已由 Git 忽略）。驗證用隨機帳戶已清理，空的測試集合可能保留。

停止服務的命令見[實作環境](lab.md)。沒有部署網站或建立付費資源。要重新驗證，先依該頁啟動環境、匯入 seed，再執行 scripts/verify.ps1；備份還原演練另行執行，避免覆蓋已有的還原目標。
