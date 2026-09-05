# 經典錯誤排查與常見陷阱 (Troubleshooting FAQ)

本頁面整理了 MongoDB 開發、部署與維運過程中最常見的 7 大經典錯誤、成因深度解析與標準解決方案。

---

## 1. `E11000 duplicate key error` (唯一鍵衝突)

### 錯誤訊息
```text
MongoServerError: E11000 duplicate key error collection: store_db.users index: email_1 dup key: { email: null }
```

### 根本原因
為欄位建立 `unique: true` 唯一索引時，若有多筆文件的該欄位**未填寫或值為 null**，MongoDB 會將第一個 `null` 視為合法值，第二筆寫入時就會觸發重複衝突！

### 解決方案
若允許該欄位不存在，應使用 **稀疏索引 (Sparse Index)** 或 **部分索引 (Partial Index)**：
```javascript
// 方案 A：建立稀疏索引 (忽略沒有該欄位的文件)
db.users.createIndex({ email: 1 }, { unique: true, sparse: true })

// 方案 B (更推薦)：部分索引 (僅針對字串型別強制唯一)
db.users.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
)
```

---

## 2. `Transaction numbers are only allowed on a replica set member`

### 錯誤訊息
```text
OperationFailure: Transaction numbers are only allowed on a replica set member or mongos
```

### 根本原因
MongoDB 規定**多文件 ACID 交易（Multi-Document Transactions）只能運行在 Replica Set（副本集）或 Sharded Cluster（分片集群）**。若嘗試在單機 Standalone 環境（例如本課程的預設 `27017` 連接埠）執行交易，資料庫會直接拒絕。

### 解決方案
請切換連線至專為交易設計的單節點副本集環境（連接埠 `27018`）：
```powershell
# 1. 確保已啟動交易專用環境
docker compose -f compose.transactions.yml up -d --wait mongodb
docker compose -f compose.transactions.yml run --rm init

# 2. 應用程式連線字串必須加上 replicaSet 與 directConnection：
# mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true
```

---

## 3. `Sort exceeded memory limit of 33554432 bytes` (32MB 記憶體排序溢出)

### 錯誤訊息
```text
Executor error during find command :: caused by :: Sort exceeded memory limit of 33554432 bytes, but did not opt in to external sort.
```

### 根本原因
當查詢包含 `sort()` 但沒有合適的索引可以直接按順序讀取資料時，MongoDB 必須在記憶體中進行排程排序（In-Memory Sort）。MongoDB 預設限制記憶體排序最多只能消耗 **32 MiB**。一旦待排序資料超過此上限，查詢會立即拋出崩潰例外。

### 解決方案
1. **建立相符的排序索引（最佳解法）**：
   遵守 **ESR 原則**，為排序欄位建立索引，讓資料庫直接依索引樹的自然順序返回，完全免除記憶體排序開銷：
   ```javascript
   db.orders.createIndex({ status: 1, createdAt: -1 })
   ```
2. **聚合管道開啟磁碟溢出（次要解法）**：
   若為報表分析管道，可加上 `{ allowDiskUse: true }`，允許資料溢出寫入暫存磁碟（但查詢速度會顯著變慢）：
   ```javascript
   db.orders.aggregate([...], { allowDiskUse: true })
   ```

---

## 4. `BSONObj size is invalid (16MB limit)` (單一文件超過 16MB)

### 錯誤訊息
```text
WriteError: BSONObj size: 18451234 is invalid. Size must be between 0 and 16793600(16MB)
```

### 根本原因
MongoDB 規定單一 BSON 文件的最大容量上限為 **16 MiB**。此設計是為了避免單一過大文件佔滿記憶體與網路頻寬。最常見的成因是在文件中設計了「長度無上限的陣列 (Unbounded Array)」（例如：在文章內無限追加留言、在設備中無限追加每秒日誌）。

### 解決方案
1. **重構為反向參照（1:Squillions 模式）**：
   子文件獨立存成另一個集合，每筆子文件記錄父實體的 `_id`：
   ```javascript
   // logs 集合中獨立儲存，並對 hostId 與 timestamp 建立複合索引
   { _id: ObjectId("..."), hostId: "server-01", message: "CPU 85%", timestamp: new Date() }
   ```
2. **採用 Bucket Pattern（桶模式）**：
   若為時間序列數據，依小時或天打包固定數量的數據桶。
3. **超大型二進位檔案**：
   若需儲存超過 16MB 的檔案或影片，請使用 MongoDB 原生的 **GridFS** 分塊儲存機制。

---

## 5. `CursorNotFound` (游標逾時遺失)

### 錯誤訊息
```text
CursorNotFound: cursor id 1234567890 not found
```

### 根本原因
當使用 `find()` 查詢大批量資料並在程式中逐筆迴圈處理時，MongoDB 伺服端預設會在游標閒置超過 **10 分鐘** 後自動關閉游標以回收記憶體。如果後端每一筆資料的業務邏輯處理太久，下次嘗試抓取下一批資料時就會遭遇 `CursorNotFound`。

### 解決方案
1. **調小批次大小（Batch Size）**：
   讓每次從資料庫拉回記憶體的資料量減少，提高處理頻率：
   ```python
   cursor = collection.find().batch_size(100)
   ```
2. **禁用游標逾時機制（謹慎使用）**：
   ```python
   cursor = collection.find(no_cursor_timeout=True)
   try:
       for doc in cursor:
           process_long_task(doc)
   finally:
       cursor.close() # 務必手動關閉，否則造成連線池與記憶體洩漏！
   ```

---

## 6. `Cannot apply $inc to a value of non-numeric type` (型別不匹配)

### 錯誤訊息
```text
Cannot apply $inc to a value of non-numeric type. {_id: ...} has field 'stock' of type string
```

### 根本原因
在關聯式資料庫中欄位型別是嚴格固定的，但在 MongoDB 中，若舊資料曾不小心寫入字串 `"10"`，後續程式嘗試呼叫 `{$inc: {stock: -1}}` 時就會報錯，因為 `$inc` 只能操作數值型別（int32, int64, double, Decimal128）。

### 解決方案
1. **在集合上套用 JSON Schema Validation**：
   限制 `stock` 欄位必須為整數，從資料庫層阻擋非法型別寫入：
   ```javascript
   db.runCommand({
     collMod: "products",
     validator: {
       $jsonSchema: {
         bsonType: "object",
         required: ["stock"],
         properties: { stock: { bsonType: "int" } }
       }
     }
   })
   ```
2. **批次洗資料修正型別**：
   ```javascript
   db.products.find({ stock: { $type: "string" } }).forEach(doc => {
     db.products.updateOne({ _id: doc._id }, { $set: { stock: parseInt(doc.stock, 10) } })
   })
   ```

---

## 7. `Unrecognized pipeline stage name: '$search'`

### 錯誤訊息
```text
MongoServerError: Unrecognized pipeline stage name: '$search'
```

### 根本原因
`$search` 與 `$vectorSearch` 依賴 Apache Lucene 引擎，此引擎深度整合在 **MongoDB Atlas (雲端託管版)** 之中。在標準的本機 Community Docker 映像檔中並不包含 Lucene Search 守護程序，因此資料庫引擎不認得此 Pipeline Stage。

### 解決方案
- 若在本地 Docker 練習，請改用一般查詢中的原生正規表達式：
  ```javascript
  db.products.find({ name: { $regex: "關鍵字", $options: "i" } })
  ```
- 若需完整體驗 `$search`、打字自動補全與 AI 向量搜尋，請建立免費的 **MongoDB Atlas M0 Sandbox** 叢集進行端到端連線演練。
