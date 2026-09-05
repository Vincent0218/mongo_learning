# Level 1：核心觀念與環境架設

在進入任何資料庫操作前，建立正確的心智模型（Mental Model）至關重要。MongoDB 屬於**文件導向（Document-Oriented）**的 NoSQL 資料庫，其設計哲學是以最貼近應用程式物件導向資料結構的方式來儲存資料。

---

## 1. RDBMS vs MongoDB 核心概念對照

| 傳統關聯式資料庫 (SQL / RDBMS) | MongoDB (NoSQL Document) | 概念說明 |
| :--- | :--- | :--- |
| **Database** (資料庫) | **Database** (資料庫) | 資料庫容器，包含多個資料表或集合 |
| **Table** (資料表) | **Collection** (集合) | 文件的集合，無強制的嚴格 Schema |
| **Row** (資料列 / 記錄) | **Document** (文件) | 單筆資料記錄，以 BSON 格式呈現 |
| **Column** (欄位) | **Field** (欄位 / 鍵) | 物件中的 Key-Value 鍵值對 |
| **Primary Key** (主鍵) | **`_id`** (預設 ObjectId) | 每筆文件的唯一識別碼，預設自動生成 |
| **Index** (索引) | **Index** (索引) | 加速查詢效能的 B-Tree 結構 |
| **JOIN** (跨表關聯) | **`$lookup` 或 內嵌文件** | 關聯查詢或直接將相依資料內嵌 |

---

## 2. JSON 與 BSON 的關鍵差異

MongoDB 內部儲存與網路傳輸使用的是 **BSON（Binary JSON）**，而非純文字的 JSON。

- **JSON 的限制**：僅支援字串、數字、布林值、陣列、物件與 null；沒有區分整數與浮點數，也沒有專屬的二進位資料或日期型別。
- **BSON 的優勢**：
  - **更豐富的型別**：支援 `Date`、`int32`、`int64`、`double`、`Decimal128`、`ObjectId`、`Binary`。
  - **高效遍歷**：文件頭部記錄長度，讀取時可快速跳過無關欄位，提升查詢速度。

### 解剖 `_id`：ObjectId 的秘密
預設的 `_id` 是 12-byte (24 個十六進位字元) 的 BSON ObjectId：
- **前 4 bytes**：Unix 時間戳記（可直接萃取文件建立時間）
- **中間 5 bytes**：隨機數值（識別產生該 ID 的主機與程序）
- **後 3 bytes**：累加計數器（保證同秒內產生的 ID 不衝突）

---

## 3. 本機環境建置：Docker Compose（最推薦）

使用 Docker 能確保開發環境純淨，不需要在主機安裝一堆服務。

在專案目錄下建立 `docker-compose.yml`：

```yaml
services:
  mongodb:
    image: mongo:7.0
    container_name: mongo_learning_db
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password123
    volumes:
      - mongo_data:/data/db

  mongo-express:
    image: mongo-express:latest
    container_name: mongo_learning_ui
    restart: always
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: admin
      ME_CONFIG_MONGODB_ADMINPASSWORD: password123
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_BASICAUTH_USERNAME: webuser
      ME_CONFIG_BASICAUTH_PASSWORD: webpassword123
    depends_on:
      - mongodb

volumes:
  mongo_data:
```

啟動服務：
```bash
docker compose up -d
```
- MongoDB 監聽埠：`localhost:27017`
- 網頁管理介面 (Mongo-Express)：`http://localhost:8081`（帳號：`webuser` / 密碼：`webpassword123`）

---

## 4. 客戶端與除錯工具

### A. MongoDB Shell (`mongosh`)
現代 MongoDB 的官方終端命令工具（取代舊版 `mongo` shell），支援現代 JavaScript 語法。

```bash
# 透過 docker 連線至 mongosh
docker exec -it mongo_learning_db mongosh -u admin -p password123 --authenticationDatabase admin
```

常用命令速查：
```javascript
show dbs;              // 列出所有資料庫
use store_db;          // 切換或建立資料庫 (若不存在會在首次寫入時自動建立)
show collections;      // 列出當前資料庫的所有集合
db.dropDatabase();     // 刪除當前資料庫
```

### B. MongoDB Compass (官方 GUI 工具)
強烈建議至 MongoDB 官網下載安裝 **MongoDB Compass**。
- 連線字串 (Connection String)：  
  `mongodb://admin:password123@localhost:27017/?authSource=admin`
- 特色：可視化 Schema 分析、可視化 Aggregation Pipeline 建造器、索引使用率圖表。
