# 核心 CRUD 操作與進階查詢

**前置條件：** 完成[資料初始化](lab.md)，在 mongosh 選擇 `mongo_learning_lab`。本章價格單位均為新台幣分。每次重做可先重跑 seed，避免前一次更新影響預期結果。

## 1. Create 與操作結果

```javascript
const demoId = ObjectId("400000000000000000000002");
db.crud_practice.replaceOne(
  {_id: demoId},
  {_id: demoId, name: "練習耳機", price: 10000, stock: 1, tags: ["音訊"]},
  {upsert: true}
);
```

一般新增用 `insertOne`／`insertMany`；此處使用固定 ID 的 replace/upsert 方便重跑。重複 insert 相同 ID 會得到 duplicate key 錯誤。不要用名稱作為理應唯一的更新鍵。

## 2. Read：比較、邏輯與陣列

> [!NOTE]
> **資料合約提醒**：本教學所有範例與種子資料中的金額，皆遵循電商系統最佳實踐統一以「**整數分 (cents)**」儲存（避免浮點數精度誤差，1 元 = 100 分）。例如 1,000 元為 `100000` 分，5,000 元為 `500000` 分。

| 運算子 | 範例 | 含義 |
| --- | --- | --- |
| `$gte`／`$lte` | `{price: {$gte: 100000, $lte: 500000}}` | 1,000 元以上、5,000 元以下（含 5,000 元） |
| `$gte`／`$lt` | `{price: {$gte: 100000, $lt: 500000}}` | 1,000 元以上、未滿 5,000 元（不含 5,000 元） |
| `$in` | `{category: {$in: ["電子產品", "配件"]}}` | 符合任一指定類別 |
| `$or` | `{$or: [{stock: {$lt: 10}}, {category: "配件"}]}` | 滿足庫存低於 10 或類別為配件 |
| `$ne`／`$nin` | `{category: {$ne: "配件"}}` | 排除配件（注意：亦會匹配欄位不存在的文件） |

同一物件多個欄位預設為 AND：

```javascript
db.products.find({price: {$gte: 300000}, stock: {$gt: 10}}, {name: 1, _id: 0})
// 無線降噪耳機、人體工學鍵盤
db.products.find({"specs.weight": {$lt: 300}}, {name: 1, _id: 0})
// 無線降噪耳機
db.products.find({tags: {$all: ["藍牙", "降噪"]}}, {name: 1, _id: 0})
// 無線降噪耳機
db.orders.find({
  items: {$elemMatch: {productId: ObjectId("100000000000000000000001"), qty: {$gt: 1}}}
})
// 訂單 ...001
```

`$elemMatch` 要求同一陣列元素滿足所有條件。改成兩個 dot notation 條件時，可能分別由不同元素命中。

### null 與欄位不存在

這是 MongoDB 最經典的 **「null 查詢陷阱」**。在共用種子資料的 4 筆商品中：
- **商品 1（耳機）**：明確寫入了 `{discount: null}`（值為 null，共 1 筆）
- **商品 2、3、4**：完全沒有 `discount` 欄位（欄位不存在，共 3 筆）

```javascript
// 1. 陷阱：{discount: null} 會同時匹配「值為 null」與「欄位完全不存在」的文檔（1 + 3 = 4）
db.products.countDocuments({discount: null})              // 回傳 4：值為 null 或欄位不存在

// 2. 正解 A：使用 BSON Type 10（即 null 型別，或寫 {$type: "null"}）精準只查「真的是 null」
db.products.countDocuments({discount: {$type: 10}})        // 回傳 1：僅商品 1（耳機）

// 3. 正解 B：使用 {$exists: false} 精準只查「根本沒有該欄位」
db.products.countDocuments({discount: {$exists: false}})   // 回傳 3：商品 2、3、4
```


### 什麼是投影（Projection）？

「**投影 (Projection)**」在資料庫領域中，指的就是**「指定只回傳哪些欄位、或隱藏哪些欄位」**（等同於 SQL 中的 `SELECT col1, col2`，而非 `SELECT *`）。

適當使用投影能大幅減少網路傳輸頻寬與記憶體開銷（例如不撈取幾百維的向量或大段文字）。`find()` 的**第二個參數**即為投影設定：

```javascript
// 1. 包含模式（Inclusion）：只拿指定欄位（設為 1）
// 預設仍會回傳 _id
db.products.find({}, {name: 1, price: 1})
// 回傳結果：{ _id: ObjectId(...), name: "無線降噪耳機", price: 499000 }

// 2. 排除模式（Exclusion）：隱藏敏感或肥大欄位，其餘全部回傳（設為 0）
db.products.find({}, {embedding: 0, description: 0})
// 回傳結果：包含除了 embedding 與 description 以外的所有欄位

// 3. 唯一的混用例外：隱藏 _id
// MongoDB 預設一定會回傳 _id；若連 _id 都不想要，可以在包含模式下唯一寫一個 _id: 0
db.products.find({}, {name: 1, price: 1, _id: 0})
// 回傳結果：{ name: "無線降噪耳機", price: 499000 }（完全沒有 _id）

// 4. 錯誤示範（混用會報錯）：
// db.products.find({}, {name: 1, description: 0})
// 拋出 MongoServerError: Cannot do inclusion on field name in exclusion projection
// 原因：資料庫無法判斷你的邏輯是「只要拿 name」還是「除了 description 其他全要」。
```


## 3. 穩定排序與分頁

```javascript
db.products.find({}, {name: 1, price: 1})
  .sort({price: -1, _id: 1}).skip(0).limit(2)
// 螢幕、耳機
```

單靠 price 排序，價格相同時順序不穩定；加入唯一的 `_id`。大 offset 的 skip 仍需走過前面的結果，可改用最後一筆的排序鍵：

```javascript
const firstPage = db.products.find().sort({price: -1, _id: 1}).limit(2).toArray();
const last = firstPage[firstPage.length - 1];
db.products.find({$or: [
  {price: {$lt: last.price}},
  {price: last.price, _id: {$gt: last._id}}
]}).sort({price: -1, _id: 1}).limit(2)
// 鍵盤、充電器
```

搭配 `{price: -1, _id: 1}` 索引。跨頁期間若價格被修改，仍可能有重複或遺漏；穩定排序不等於資料快照。空的第一頁沒有 last，應停止翻頁。

## 4. Update：原子性與業務條件

```javascript
const stockFilter = {_id: demoId, stock: {$gte: 1}};
db.crud_practice.updateOne(stockFilter, {$inc: {stock: -1}, $currentDate: {updatedAt: true}})
// matchedCount: 1
db.crud_practice.updateOne(stockFilter, {$inc: {stock: -1}})
// matchedCount: 0，不能扣成負數
```

單文件更新是原子的，但單靠 `$inc` 不會檢查庫存是否足夠。應把前置條件放進 filter，並檢查 matchedCount。matchedCount 為 1、modifiedCount 為 0 也可能只是新舊值相同，不能一概視為失敗。

```javascript
db.crud_practice.updateOne({_id: demoId}, {$set: {price: 9900, onSale: true}})
db.crud_practice.updateOne({_id: demoId}, {$unset: {onSale: ""}})
db.crud_practice.updateOne({_id: demoId}, {$push: {tags: "熱銷"}})
db.crud_practice.updateOne({_id: demoId}, {$addToSet: {tags: "音訊"}})
db.crud_practice.updateOne({_id: demoId}, {$pull: {tags: "熱銷"}})
```

`updateOne` 的更新文件使用運算子，或合法的更新 pipeline；完整替換請明確使用 `replaceOne`，並理解未提供的欄位會被移除。不要把完整 API 請求物件直接當成更新文件。

### Upsert 與唯一性

```javascript
db.user_stats.createIndex({userId: 1}, {unique: true})
db.user_stats.updateOne(
  {userId: ObjectId("200000000000000000000001")},
  {$inc: {loginCount: 1}, $set: {lastLogin: new Date()}, $setOnInsert: {createdAt: new Date()}},
  {upsert: true}
)
```

唯一索引才負責約束 userId 唯一；實務上也要處理併發 upsert 可能出現的 duplicate key 錯誤。

## 5. Delete 與驗證

```javascript
db.crud_practice.deleteOne({_id: demoId}) // deletedCount: 1
```

`deleteMany({})` 會刪除整個集合內的文件；使用前先以相同條件 find/count，確認目標。

[實作環境](lab.md)的 `crud-checks.js` 驗證 null 語意、增查改刪、庫存不足與 regex 字面搜尋，不更動商品資料。

## 練習與解答

**練習：** 為什麼「先讀 stock，再無條件扣庫存」在兩個請求同時發生時不可靠？

??? success "解答"
    兩個請求可能都讀到 stock=1，之後各扣一次而變成 -1。使用同一個 updateOne 的 `stock: {$gte: 1}` 條件，讓檢查與扣減一起原子執行；第二次更新不命中。

參考：[Atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)、[Query null](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/)。
