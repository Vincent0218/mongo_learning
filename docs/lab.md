# 實作環境、共用資料與驗證

## 前置條件

安裝 Git、Docker Desktop（Linux containers）及 uv；執行前先啟動 Docker Desktop。網站需要 Python 3.12；uv 會依專案設定管理環境。語言範例另需 Go 1.23 以上或 .NET 8 SDK 以上。

本頁命令均從專案根目錄在 PowerShell 執行。MongoDB 7.0 是本課程的伺服器基準；套件版本固定於各範例的 manifest 與 lockfile，並非宣稱使用最新版本。

## 1. 一般 CRUD 環境

```powershell
docker compose up -d --wait
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet --eval 'db.adminCommand({ping: 1})'
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/seed.js
```

預期 ping 回傳 `ok: 1`，seed 顯示 `products=4, users=2, orders=4`。這是固定資料筆數；若自行新增資料，集合總數會增加。

- 連線：`mongodb://admin:password123@127.0.0.1:27017/?authSource=admin`
- Mongo Express：<http://127.0.0.1:8081>，帳號 `webuser`、密碼 `webpassword123`。
- Compose 僅開放本機 loopback；這些固定帳密僅供本機教學。root 帳號方便練習，應用程式正式環境改用最小權限帳號。

進入 shell 後選擇教學資料庫：

```powershell
docker compose exec mongodb mongosh -u admin -p password123 --authenticationDatabase admin
```

```javascript
use mongo_learning_lab
db.products.countDocuments() // 乾淨環境為 4
```

`use`、`show dbs` 是互動 shell 輔助命令；JS 腳本改用 `db.getSiblingDB()`。

## 2. 交易用 replica set

一般環境是 standalone，不能執行多文件交易。另啟動獨立資料卷及 27018 連接埠：

```powershell
docker compose -f compose.transactions.yml up -d --wait mongodb
docker compose -f compose.transactions.yml run --rm init
docker compose -f compose.transactions.yml exec -T mongodb mongosh --quiet --eval 'db.hello()'
docker compose -f compose.transactions.yml exec -T mongodb mongosh --quiet /examples/seed.js
```

預期初始化輸出 `rs0 primary ready`，hello 包含 `setName: "rs0"`、`isWritablePrimary: true`。初始化可重跑；資料庫健康不代表已經選出 primary，因此不要省略 init。

主機端連線：

```text
mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true
```

這個 replica set 宣告的成員名稱 `mongodb:27017` 只在 Compose 網路內可解析。主機端用 `directConnection=true` 直接連接本機對應的 Port (Port Mapping)；這是本機單節點練習方式。正式多節點部署必須使用客戶端可解析的各節點位址與正常拓撲探索。

!!! warning "僅供本機練習"
    交易環境沒有啟用認證，僅將連接埠綁定 loopback；同機程式及相同 Docker 網路仍可連線。不要公開此環境。單節點 replica set 能練習交易，但不能演練高可用；正式副本集還需認證、TLS、內部認證與多個節點。

### 雙環境連線特徵速查表

| 環境分類 | 監聽埠 (Port) | 認證 (Auth) | 適用場景與章節 | 連線字串 (Connection URI) 關鍵特徵 |
| :--- | :--- | :--- | :--- | :--- |
| **一般環境** (Standalone) | `27017` | `admin` / `password123` | 核心基礎、查詢分析、索引練習 | `mongodb://admin:password123@127.0.0.1:27017/?authSource=admin` |
| **交易環境** (Replica Set) | `27018` | 無 (免密碼) | 應用實戰之多文件 ACID 交易 | `mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true` |

> 💡 **防踩坑提示**：多文件交易在 MongoDB 中**嚴格要求**在 Replica Set 或 Sharded Cluster 執行。若使用 `27017` 執行交易會收到 `Transaction numbers are only allowed on a replica set member` 錯誤。

## 3. 資料契約

所有腳本固定使用 `mongo_learning_lab`，不會從 URI 推導目標資料庫。一般與交易環境各自有一份資料。

| 項目 | 約定 |
| --- | --- |
| 商品／使用者／訂單 ID | BSON ObjectId，分別以 1／2／3 開頭的固定 24 位 ID |
| 日期欄位 | BSON Date，camelCase 的 `createdAt`，採 UTC |
| 商品價格、訂單單價、帳戶餘額 | 整數，單位為新台幣「分」；499000 代表 NT$4,990 |
| 訂單狀態 | `PAID`、`CANCELLED`；練習自建資料可使用 `PENDING` |
| 關聯 | `orders.userId → users._id`；`items.productId → products._id` |
| 向量 | 固定 3 維教學數值，沒有真實語義 |

`seed.js` 以固定 ID replace/upsert：重跑會還原這 10 筆文件，也會覆蓋它們的練習修改，但保留其他 ID。要重做會改資料的章節，先重新執行 seed。教材片段若標示「示意」不應直接執行。

```javascript
--8<-- "examples/mongosh/seed.js"
```

## 4. 驗證命令

專案已內建 `./scripts/verify.ps1` 一鍵驗證腳本，會在完成各項檢查後自動退出，並防止 PowerShell 在不同版本（如 Windows PowerShell 5.1 與 pwsh 7）下的引號跳脫差異問題。推薦直接執行：

```powershell
./scripts/verify.ps1
```

若欲手動逐步執行驗證，可依序在 PowerShell 執行下列分段指令（中文輸出若遇編碼問題，Python 可加上 `-X utf8`）：

```powershell
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/crud-checks.js
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/aggregation.js
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/indexing.js

uv run --project examples/python examples/python/demo.py
uv run --project examples/python python -m unittest discover -s examples/python -v

Push-Location examples/go
go run .
go test -v ./...
Pop-Location

dotnet run --project examples/dotnet
dotnet run --project examples/dotnet -- --check
uv run mkdocs build --strict
```

語言程式預設 CRUD 連到 27017，交易檢查連到 27018；可透過 `MONGO_URI`、`MONGO_TX_URI` 覆寫，但仍只寫教學資料庫。不要指向正式環境。

交易測試在各語言專用集合中建立隨機 ID 的兩個帳戶，結束時只刪除該次建立的 ID。正常轉帳後為 7500／7500；六種拒絕情境皆維持 10000／5000。連線失敗會讓測試失敗，不會假裝略過後通過。

## 5. 停止與重設

停止服務並保留資料：

```powershell
docker compose stop
docker compose -f compose.transactions.yml stop
```

!!! danger "只有需要完全重做練習時才執行"
    下列命令刪除一般環境的整個 `mongo_learning_lab`，包括自行新增的教學資料。沒有自動復原；seed 只能重建教材資料。請先備份想保留的內容。

```powershell
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/reset.js
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/seed.js
```

重設交易環境時使用 `docker compose -f compose.transactions.yml exec -T mongodb mongosh --quiet /examples/reset.js`，再於同一環境執行 seed。不需要刪除 Docker volume。

## 練習與解答

**練習：** 為何一般環境 ping 成功，交易仍會失敗？

??? success "解答"
    ping 只能證明服務可回應。多文件交易要求 replica set 或 sharded cluster；另外要檢查 hello 的 setName 與 primary 狀態，並使用交易環境的連線字串。
