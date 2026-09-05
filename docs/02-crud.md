# Level 2：核心 CRUD 操作與進階查詢

CRUD 是與資料庫互動的基石。在 MongoDB 中，所有查詢與更新都是以 BSON 物件（鍵值對）表達，具備極高的表現力。

---

## 1. Create (新增資料)

新增時，MongoDB 會自動為未指定 `_id` 的文件產生唯一的 `ObjectId`。

```javascript
// 新增單筆
db.products.insertOne({
  name: "無線降噪耳機",
  category: "電子產品",
  price: 4990,
  tags: ["藍牙", "音訊", "降噪"],
  specs: { weight: 250, batteryHours: 30 },
  stock: 45,
  createdAt: new Date()
});

// 批量新增多筆
db.products.insertMany([
  { name: "人體工學鍵盤", category: "周邊配備", price: 3200, stock: 12 },
  { name: "4K 27吋螢幕", category: "周邊配備", price: 9900, stock: 8 },
  { name: "USB-C 充電器", category: "配件", price: 890, stock: 120 }
]);
```

---

## 2. Read (查詢與過濾)

`db.collection.find(queryFilter, projection)`

### A. 比較運算子 (Comparison Operators)

| 運算子 | 意義 | 範例 |
| :--- | :--- | :--- |
| `$eq` | 等於 | `{ price: { $eq: 4990 } }` 或直接簡寫 `{ price: 4990 }` |
| `$gt` / `$gte` | 大於 / 大於等於 | `{ price: { $gte: 3000 } }` |
| `$lt` / `$lte` | 小於 / 小於等於 | `{ stock: { $lte: 10 } }` (庫存吃緊) |
| `$ne` | 不等於 | `{ category: { $ne: "配件" } }` |
| `$in` / `$nin` | 存在清單內 / 不在清單內 | `{ category: { $in: ["電子產品", "周邊配備"] } }` |

### B. 邏輯運算子 (Logical Operators)

```javascript
// 尋找價格 >= 3000 且 庫存 > 10 的商品
db.products.find({
  $and: [
    { price: { $gte: 3000 } },
    { stock: { $gt: 10 } }
  ]
});
// 簡寫形式 (同一個物件多欄位預設為 AND)
db.products.find({ price: { $gte: 3000 }, stock: { $gt: 10 } });

// OR 查詢：分類是配件 或 價格低於 1000
db.products.find({
  $or: [
    { category: "配件" },
    { price: { $lt: 1000 } }
  ]
});
```

### C. 巢狀物件與陣列查詢 (Dot Notation)

- **巢狀欄位**：必須使用雙引號包覆屬性路徑
  ```javascript
  // 查詢規格重量小於 300 克的商品
  db.products.find({ "specs.weight": { $lt: 300 } });
  ```
- **陣列包含特定值**：
  ```javascript
  // 標籤陣列包含 "藍牙"
  db.products.find({ tags: "藍牙" });
  
  // 標籤必須同時包含 "藍牙" 與 "降噪"
  db.products.find({ tags: { $all: ["藍牙", "降噪"] } });
  
  // 陣列元素是物件時，使用 $elemMatch 精確匹配同一個物件的多個條件
  db.orders.find({
    items: {
      $elemMatch: { productId: "p001", qty: { $gt: 2 } }
    }
  });
  ```

### D. 投影 (Projection) 與分頁排序

```javascript
// 只抓取 name, price，排除預設的 _id
db.products.find(
  { price: { $gt: 1000 } },
  { name: 1, price: 1, _id: 0 }
)
.sort({ price: -1 })   // 1 為升冪，-1 為降冪
.skip(10)              // 跳過前 10 筆 (第 2 頁)
.limit(10);            // 取 10 筆
```

---

## 3. Update (修改資料)

!!! warning "嚴禁無運算子更新"
    在舊版語法中若不小心寫成 `db.collection.update({_id: 1}, {name: "新名稱"})`，整筆文件會被替換成只剩下該欄位。請務必使用 `$set` 等更新運算子！

### A. 常用欄位更新運算子

```javascript
// 更新單筆：修改價格、增加庫存、記錄最後修改時間
db.products.updateOne(
  { name: "無線降噪耳機" },
  {
    $set: { price: 4590, onSale: true },
    $inc: { stock: -1 },                      // 原子累加/扣減 (-1 代表扣庫存)
    $currentDate: { updatedAt: true }         // 自動賦予當前時間
  }
);

// 刪除欄位：$unset
db.products.updateOne(
  { name: "無線降噪耳機" },
  { $unset: { onSale: "" } }
);
```

### B. 陣列欄位更新運算子

```javascript
// 1. 新增元素到陣列：$push
db.products.updateOne(
  { name: "無線降噪耳機" },
  { $push: { tags: "熱銷" } }
);

// 2. 避免重複新增 (集合概念)：$addToSet
db.products.updateOne(
  { name: "無線降噪耳機" },
  { $addToSet: { tags: "藍牙" } }   // 若已存在則忽略
);

// 3. 移除符合條件的元素：$pull
db.products.updateOne(
  { name: "無線降噪耳機" },
  { $pull: { tags: "配件" } }
);
```

### C. Upsert (存在則更新，不存在則插入)

```javascript
// 若無此使用者統計記錄則自動建立，若有則累計登入次數
db.user_stats.updateOne(
  { userId: "u123" },
  {
    $inc: { loginCount: 1 },
    $set: { lastLogin: new Date() }
  },
  { upsert: true }
);
```

---

## 4. Delete (刪除資料)

```javascript
// 刪除單筆
db.products.deleteOne({ _id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d1") });

// 條件批量刪除 (如刪除庫存為 0 且已下架的商品)
db.products.deleteMany({ stock: 0, status: "archived" });
```
