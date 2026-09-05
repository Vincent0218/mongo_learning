# MongoDB 高頻語法與指令速查表 (Cheat Sheet)

本頁面彙整日常開發、除錯與維運中最常查閱的 MongoDB 核心語法、運算子與命令。適合日常開發時隨時「Ctrl + F」快速檢索。

---

## 1. 雙 Docker 環境與連線速查

| 操作目標 | 執行指令 | 連線字串特徵 |
| :--- | :--- | :--- |
| **啟動一般環境** (27017) | `docker compose up -d --wait` | `mongodb://admin:password123@127.0.0.1:27017/?authSource=admin` |
| **啟動交易環境** (27018) | `docker compose -f compose.transactions.yml up -d --wait mongodb` | `mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true` |
| **初始化交易副本集** | `docker compose -f compose.transactions.yml run --rm init` | 首次啟動必須執行以選出 Primary |
| **匯入種子資料 (一般)** | `docker compose exec -T mongodb mongosh -u admin -p password123 --authenticationDatabase admin --quiet /examples/seed.js` | 還原 4 商品、2 使用者、4 訂單 |
| **匯入種子資料 (交易)** | `docker compose -f compose.transactions.yml exec -T mongodb mongosh --quiet /examples/seed.js` | 供多文件交易練習 |
| **一鍵全功能本機驗證** | `./scripts/verify.ps1` | 自動執行 mongosh、Python、C#、Go 與文件檢驗 |

---

## 2. mongosh 互動 Shell 常用命令

```javascript
show dbs                         // 列出所有資料庫
use mongo_learning_lab           // 切換至指定資料庫 (不存在時首次寫入自動建立)
show collections                 // 列出目前資料庫中的集合
db.getName()                     // 顯示當前所在的資料庫名稱
db.products.countDocuments()     // 計算集合文件總數
db.dropDatabase()                // 刪除當前所在的整個資料庫
db.products.drop()               // 刪除指定集合及其所有索引
```

---

## 3. CRUD 查詢運算子 (Query Operators)

### 比較與邏輯運算子
```javascript
// 等值與範圍
db.products.find({ price: { $gte: 100000, $lte: 500000 } })

// 包含清單 ($in)
db.products.find({ category: { $in: ["電子產品", "周邊配備"] } })

// 邏輯 OR 查詢
db.products.find({
  $or: [
    { stock: { $lt: 10 } },
    { category: "配件" }
  ]
})
```

### 巢狀結構與陣列查詢
```javascript
// 巢狀欄位 (必須使用引號 Dot Notation)
db.products.find({ "specs.weight": { $lt: 300 } })

// 陣列全包含 ($all)
db.products.find({ tags: { $all: ["藍牙", "降噪"] } })

// 陣列物件多條件精確匹配 ($elemMatch：同一元素同時滿足多條件)
db.orders.find({
  items: { $elemMatch: { productId: ObjectId("100000000000000000000001"), qty: { $gt: 1 } } }
})

// 區分 null 與欄位不存在
db.products.find({ discount: null })             // 包含值為 null 或該欄位不存在的文件
db.products.find({ discount: { $type: 10 } })     // 僅匹配值確切為 BSON null 的文件
db.products.find({ discount: { $exists: false } })// 僅匹配欄位不存在的文件
```

### 排序、分頁與投影
```javascript
db.products.find({}, { name: 1, price: 1, _id: 0 }) // 投影：包含 name, price，排除 _id
  .sort({ price: -1, _id: 1 })                      // 複合排序：價格降冪、_id 升冪 (保證順序穩定)
  .skip(0)                                          // 跳過筆數 (Offset 分頁)
  .limit(10)                                        // 取得筆數
```

---

## 4. Update 原子更新運算子 (Update Operators)

```javascript
// 欄位修改與原子累加 (防超賣模式：將前置條件放進 filter)
db.products.updateOne(
  { _id: ObjectId("..."), stock: { $gte: 1 } },     // 前置防禦條件
  {
    $inc: { stock: -1 },                            // 原子扣減庫存
    $set: { onSale: true },                         // 設定欄位值
    $unset: { oldField: "" },                       // 移除指定欄位
    $currentDate: { updatedAt: true }               // 自動賦予當前 UTC 時間
  }
)

// 陣列操作
db.products.updateOne(
  { _id: ObjectId("...") },
  {
    $push: { tags: "熱銷" },                         // 追加元素至陣列末尾
    $addToSet: { tags: "音訊" },                     // 集合去重追加 (若已存在則忽略)
    $pull: { tags: "舊標籤" }                        // 移除匹配條件的陣列元素
  }
)

// Upsert (存在則更新，不存在則自動建立)
db.user_stats.updateOne(
  { userId: "user_01" },
  { $inc: { loginCount: 1 }, $set: { lastLogin: new Date() } },
  { upsert: true }
)
```

---

## 5. Aggregation 聚合管道模版

```javascript
db.orders.aggregate([
  // 1. 前期過濾 (善用索引，盡早縮小資料集)
  { $match: { status: "PAID", createdAt: { $gte: ISODate("2026-01-01T00:00:00Z") } } },

  // 2. 展開明細陣列 (一筆訂單轉為多筆明細)
  { $unwind: "$items" },

  // 3. 分組統計 (使用累加器)
  {
    $group: {
      _id: "$items.productId",
      totalQty: { $sum: "$items.qty" },
      totalRevenue: { $sum: { $multiply: ["$items.qty", "$items.unitPrice"] } },
      orderCount: { $sum: 1 }
    }
  },

  // 4. 排序與取前 N 名
  { $sort: { totalRevenue: -1, _id: 1 } },
  { $limit: 5 },

  // 5. 跨集合關聯 (相當於 LEFT JOIN)
  {
    $lookup: {
      from: "products",
      localField: "_id",
      foreignField: "_id",
      as: "productDoc"
    }
  },

  // 6. 重塑輸出結構
  {
    $project: {
      _id: 0,
      productId: "$_id",
      totalRevenue: 1,
      productName: { $arrayElemAt: ["$productDoc.name", 0] }
    }
  }
])
```

---

## 6. 索引管理與效能調校速查

### 常用索引建立命令
```javascript
// 唯一索引 (Unique)
db.users.createIndex({ email: 1 }, { unique: true })

// 複合索引 (遵守 ESR 原則：Equality ➔ Sort ➔ Range)
db.orders.createIndex({ status: 1, createdAt: -1, totalAmount: 1 })

// 陣列多鍵索引 (Multikey)
db.products.createIndex({ tags: 1 })

// TTL 自動過期索引 (定時刪除日誌/暫存)
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }) // 24小時後過期

// 查看與刪除索引
db.orders.getIndexes()
db.orders.dropIndex("status_1_createdAt_-1_totalAmount_1")
```

### 執行計畫 `explain("executionStats")` 關鍵指標解讀

| 指標名稱 | 理想狀態 | 危險警訊 | 核心意義 |
| :--- | :--- | :--- | :--- |
| **`stage`** | `IXSCAN` ➔ `FETCH` | `COLLSCAN`、`SORT` | `COLLSCAN` 為全表掃描；`SORT` 代表記憶體耗額外排序 |
| **`totalDocsExamined`** | 接近 `nReturned` | 遠大於 `nReturned` | 儲存引擎實際從硬碟/快取讀出的文件總數 |
| **`totalKeysExamined`** | 越小越好 | 數千至數萬 | 索引 B-Tree 走訪掃描的 Key 數量 |
| **Covered Query** | 只出現 `IXSCAN` | 出現 `FETCH` | 查詢與投影欄位全在索引中，完全免讀硬碟文件 |
