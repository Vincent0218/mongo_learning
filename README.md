# MongoDB 實戰升級指南

繁體中文 MongoDB 教學，包含共用電商資料、可執行的 mongosh／Python／C#／Go 範例，以及交易失敗案例驗證。

## 閱讀教學

需先安裝 uv。網站使用 Python 3.12 與 MkDocs Material：

```powershell
uv run mkdocs serve
```

瀏覽 <http://127.0.0.1:8000>。若需產生靜態網站，執行 `uv run mkdocs build --strict`；site/ 是本機建置產物，不隨 Git 提供。透過 HTTP 伺服器閱讀，避免 file:// 影響搜尋與導覽。

## 快速實作

先啟動 Docker Desktop（Linux containers），在專案根目錄執行：

```powershell
docker compose up -d --wait
docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/seed.js
```

MongoDB：`mongodb://admin:password123@127.0.0.1:27017/?authSource=admin`

Mongo Express：<http://127.0.0.1:8081>（webuser / webpassword123）

這些帳密僅供本機練習。程式只使用 mongo_learning_lab；金額統一為整數新台幣分。重跑 seed 會還原固定教材文件，其他 ID 保留。

交易需獨立 replica set：

```powershell
docker compose -f compose.transactions.yml up -d --wait mongodb
docker compose -f compose.transactions.yml run --rm init
docker compose -f compose.transactions.yml exec -T mongodb mongosh --quiet /examples/seed.js
```

交易 URI：`mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true`。此環境無認證、僅綁定本機，單節點只供交易練習，不具高可用。

完整前置條件、資料契約、停止與重設方式見[實作環境](docs/lab.md)。

## 學習章節

| 章節 | 內容 |
| --- | --- |
| [Level 1](docs/01-basics.md) | 文件模型、BSON、ObjectId 與環境 |
| [Level 2](docs/02-crud.md) | CRUD、null、條件更新、穩定分頁 |
| [Level 3](docs/03-aggregation.md) | 月度營收排行榜與 lookup |
| [Level 4](docs/04-indexing.md) | ESR、explain、covered query |
| [搜尋專題](docs/04-atlas-search.md) | 中文全文、字面包含、補全、教學向量 |
| [Level 5](docs/05-data-modeling.md) | 內嵌／參照、四大模式、schema validation |
| [Python](docs/06-python-integration.md) | PyMongo Async 與 Pydantic |
| [C#](docs/06-dotnet-integration.md) | .NET 8、Driver、LINQ |
| [Go](docs/06-golang-integration.md) | Go Driver v2、context |
| [Level 7](docs/07-architecture.md) | 副本集、一致性、分片、備份還原 |

## 範例與驗證

在初始化上述兩個環境後：

可直接執行 `./scripts/verify.ps1`，任一檢查失敗就停止；或逐項執行以下命令。Windows 若中文輸出亂碼，可用 `uv run --project examples/python python -X utf8 examples/python/demo.py`。

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

依賴固定於各範例的 manifest／lockfile：PyMongo 4.15.5、Pydantic 2.12.5、Go Driver 2.3.1、C# Driver 3.5.0。測試在各語言專用集合建立隨機帳戶並清理當次 ID；失敗情境須保證餘額不變。

Search 需要額外相容環境。索引 JSON 與驗證腳本在 [examples/search](examples/search)，執行前依[搜尋章](docs/04-atlas-search.md)建索引並等待同步。一般本機測試不代表 Search 已通過實測。

本次實測版本、結果及尚未完成的環境驗證見[驗證紀錄](docs/verification.md)。

## Vercel 部署

專案保留 vercel.json 與 requirements.txt。可將 Git 儲存庫匯入 Vercel，或使用 CLI `npx vercel` 預覽、`npx vercel --prod` 發布。部署建置使用 strict 模式；需包含 examples，因為文件引用其程式碼。部署網站不會部署 MongoDB。
