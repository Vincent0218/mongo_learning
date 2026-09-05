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

| 運算子 | 範例 | 含義 |
| --- | --- | --- |
| `$gte`／`$lt` | `{price: {$gte: 100000, $lt: 500000}}` | 1000 元以上、5000 元以下 |
| `$in` | `{category: {$in: ["電子產品", "配件"]}}` | 任一類別 |
| `$or` | `{$or: [{stock: {$lt: 10}}, {category: "配件"}]}` | 任一條件 |
| `$ne`／`$nin` | `{category: {$ne: "配件"}}` | 也可能包含欄位不存在的文件 |

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

```javascript
db.products.countDocuments({discount: null})              // 4：null 或不存在
db.products.countDocuments({discount: {$type: 10}})        // 1：BSON null
db.products.countDocuments({discount: {$exists: false}})   // 3：不存在
```

投影可以選擇欄位或排除欄位；除了 `_id` 可例外排除之外，投影時不要同時混用包含（inclusion）與排除（exclusion）。

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
