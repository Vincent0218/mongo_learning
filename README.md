# 🍃 MongoDB 實戰升級指南 (Mongo Learning)

本專案提供一套**由淺入深、結合理論與動手實作的 MongoDB 學習系統**。文件已整合現代化靜態網站生成器，讓您可以在瀏覽器中享受清爽美觀、支援深淺色切換、即時搜尋與程式碼一鍵複製的閱讀體驗。

---

## 🌐 如何在網站上查看教學文件

本專案使用 `uv` 建立隔離虛擬環境，並透過 `mkdocs-material` 構建文件網站。

### 方式 1：啟動本地伺服器（推薦，具備熱重載）

在終端機中執行：

```powershell
uv run mkdocs serve
```

接著在瀏覽器打開：  
👉 **`http://127.0.0.1:8000`**

### 方式 2：直接以瀏覽器開啟靜態網站

靜態 HTML 檔案已預先打包至 `site/` 目錄，您只需直接開啟：  
👉 [`site/index.html`](site/index.html)（雙擊檔案即可在瀏覽器開啟瀏覽）

---

## 🚀 快速啟動本地實作環境

專案已配置好標準的 `docker-compose.yml`，讓您在純淨環境下操作 MongoDB：

### 1. 啟動 MongoDB 與網頁管理介面 (Mongo Express)

```powershell
docker compose up -d
```

- **MongoDB 連線字串**：`mongodb://admin:password123@localhost:27017/?authSource=admin`
- **Mongo Express 網頁管理介面**：`http://localhost:8081`（帳號：`webuser` / 密碼：`webpassword123`）

### 2. 進入容器終端執行 `mongosh`

```powershell
docker exec -it mongo_learning_db mongosh -u admin -p password123 --authenticationDatabase admin
```

---

## 📚 學習大綱導覽

| 篇章 | 主題 | 核心重點 |
| :--- | :--- | :--- |
| **Level 1** | [觀念與環境架設](docs/01-basics.md) | NoSQL 與關聯資料庫差異、BSON 原理、ObjectId 解析、Docker 環境 |
| **Level 2** | [核心 CRUD 操作](docs/02-crud.md) | 豐富查詢過濾器、原子更新運算符、陣列操作、分頁排序 |
| **Level 3** | [聚合管道 Aggregation](docs/03-aggregation.md) | Pipeline 觀念、`$match`, `$group`, `$unwind`, `$lookup` 關聯分析 |
| **Level 4** | [索引與效能調校](docs/04-indexing.md) | 複合索引最左前綴、ESR 原則、`explain` 執行計畫解讀 |
| **Level 5** | [資料模型設計思維](docs/05-data-modeling.md) | 內嵌（Embedding）vs 參照（Referencing）、Subset 與 Bucket 等 4 大設計模式 |
| **Level 6** | [Python 實戰整合](docs/06-python-integration.md) | 使用 `uv` 環境、PyMongo、Motor 非同步、Pydantic 驗證、交易 |
| **Level 6** | [.NET (C#) 實戰整合](docs/06-dotnet-integration.md) | 官方 `MongoDB.Driver`、POCO BSON 標記、LINQ 查詢、強型別 Builders、Repository 封裝 |
| **Level 6** | [Golang 實戰整合](docs/06-golang-integration.md) | 官方 `mongo-go-driver`、BSON (M/D/E/A) 四大結構、Pipeline 聚合、連線池、交易 |
| **Level 7** | [叢集架構與維運](docs/07-architecture.md) | 副本集（Replica Set）高可用自動容錯、分片（Sharding）水平擴展 |

---

## ☁️ 部署至 Vercel

本專案已備妥 [`vercel.json`](vercel.json) 與 [`requirements.txt`](requirements.txt)，可直接一鍵部署至 Vercel：

### 方法 A：透過 GitHub 連動 Vercel（最推薦，推送代碼自動發布）
1. 將此專案推送到您的 GitHub Repository。
2. 登入 [Vercel 官網](https://vercel.com/)，點選 **"Add New Project"** ➔ **"Import"** 該 GitHub 儲存庫。
3. Vercel 會自動偵測並讀取專案中的 `vercel.json`，直接點擊 **"Deploy"** 即可自動完成建置並產生公開網址！

### 方法 B：使用 Vercel CLI 本地直接部署
```powershell
# 1. 登入並發布至預覽環境
npx vercel

# 2. 發布至生產環境
npx vercel --prod
```
