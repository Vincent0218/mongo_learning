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


## 3. 穩定排序與高效率分頁

在資料庫分頁中，主要有兩種做法：**傳統 Offset 分頁（`skip + limit`）** 與 **游標式分頁（Keyset / Cursor Pagination）**。

### 做法 A：傳統 Offset 分頁（適合小數據量）

```javascript
// 第 1 頁（每頁 2 筆）
db.products.find({}, {name: 1, price: 1})
  .sort({price: -1, _id: 1}).skip(0).limit(2)
// 回傳：螢幕、耳機

// 第 2 頁
db.products.find({}, {name: 1, price: 1})
  .sort({price: -1, _id: 1}).skip(2).limit(2)
// 回傳：鍵盤、充電器
```

> [!WARNING]
> **「大 offset 的 skip」效能黑洞（深度分頁問題）**：  
> 當使用者翻到第 1,000 頁時，指令為 `skip(20000).limit(20)`。MongoDB **並非直接跳到第 20,001 筆**，而是必須在硬碟或記憶體中**實體掃描並數過前 20,000 筆文件**，然後全部丟棄，只取最後 20 筆。  
> 頁數越深，CPU 與 I/O 消耗越高，查詢耗時會從幾毫秒暴增至數秒甚至超時。

---

### 做法 B：游標式分頁（Keyset Pagination，推薦海量資料採用）

**核心思維**：不要叫資料庫「數過前面幾萬筆再丟掉」，而是記住**「上一頁最後一筆資料的排序欄位值（Keyset）」**，下一頁直接向後檢索。

假設第 1 頁最後一筆商品（`last`）為：`{ price: 499000, _id: ObjectId("...") }`。  
下一頁查詢直接以 `last` 的數值當作錨點：

```javascript
// 1. 取出第一頁，並取得最後一筆記錄
const firstPage = db.products.find().sort({price: -1, _id: 1}).limit(2).toArray();
const last = firstPage[firstPage.length - 1];

// 2. 第二頁：直接利用 B-Tree 索引定位到上一頁之後的資料（完全不用 skip）
db.products.find({
  $or: [
    // 情況 1：價格比上一頁最後一筆更低
    { price: { $lt: last.price } },
    // 情況 2：價格剛好相同，但 _id 順序在上一頁最後一筆之後（解決並列同價問題）
    { price: last.price, _id: { $gt: last._id } }
  ]
}).sort({price: -1, _id: 1}).limit(2);
// 回傳：鍵盤、充電器
```

#### 為什麼要加 `_id: 1` 複合排序？
若僅以 `price: -1` 排序，當多筆商品「價格完全相同」時，MongoDB 無法保證回傳順序，翻頁時容易發生「同一筆商品在第 1 頁與第 2 頁重複出現」或「漏掉某些商品」。加入全域唯一的 `_id` 才能保證**順序絕對穩定**。

搭配 `{price: -1, _id: 1}` 複合索引，此查詢可達到 $O(\log N)$ 的極速二分查找，無論翻到第 1 頁還是第 1,000 頁，速度都在毫秒級！


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

`updateOne` 的更新文件必須明確使用更新運算子（如 `$set`、`$inc`），或合法的更新 pipeline；若需要整份文件替換，請明確使用 `replaceOne`。

> [!CAUTION]
> **為什麼「絕對不要把完整 API 請求物件直接當成更新文件」？**
> 
> 初學者常圖方便，直接將 HTTP 請求的 JSON 物件（如 Express 的 `req.body`、FastAPI 的 dict）整包傳入更新，這會引發嚴重的**資安漏洞與資料意外抹除**：
> 
> 1. **大量賦值漏洞（Mass Assignment / 權限竄改）**：  
>    假設 API 原本只供修改個人暱稱，但攻擊者在 JSON 惡意塞入 `"role": "admin"` 或 `"balance": 99999999`。若直接執行 `updateOne(..., {$set: req.body})`，攻擊者將直接取得管理員權限或竄改錢包餘額！
> 2. **資料意外抹除（誤用 replaceOne）**：  
>    若誤用 `replaceOne(..., req.body)`，因前端通常只傳遞「修改的欄位」，`replaceOne` 會將整份文件直接抹平替換，導致原有的 `passwordHash`、`createdAt`、`permissions` 等未傳欄位**永久遺失**。
> 3. **正確防護做法（DTO 白名單機制）**：  
>    後端應透過型別定義（如 Pydantic / C# DTO / Go Struct）嚴格過濾欄位，只顯式更新被允許的屬性：
>    ```javascript
>    // ❌ 危險寫法：整包傳入，任由攻擊者注入未知欄位
>    db.users.updateOne({_id: userId}, {$set: req.body});
>    
>    // ✅ 正確做法：透過白名單物件顯式提取允許更新的欄位
>    const allowedUpdate = {
>      nickname: sanitize(req.body.nickname),
>      avatarUrl: req.body.avatarUrl
>    };
>    db.users.updateOne({_id: userId}, {$set: allowedUpdate, $currentDate: {updatedAt: true}});
>    ```


### 什麼是 Upsert？（Update + Insert）

「**Upsert**」是 **Update（更新）** 與 **Insert（新增）** 的組合字，其核心語意為：**「若文檔已存在則更新；若不存在則直接新增」**。

在過去傳統的做法中，工程師往往需要寫兩段邏輯：「先 `findOne` 查詢是否存在，若存在則調用 `updateOne`，若不存在則調用 `insertOne`」。這種做法不僅產生兩次網路往返（RTT），更會在高併發場景下引發競爭條件（Race Condition）。

在 MongoDB 中，只需在 `updateOne` / `updateMany` 的第三個參數傳入 `{ upsert: true }`，即可完成原子性的「有則改之，無則生之」：

```javascript
// 範例情境：使用者每次登入時，更新其登入紀錄；若首次登入則自動建立紀錄文件
db.user_stats.updateOne(
  // 1. 查詢條件 (Filter)：用來判斷文件是否已存在
  { userId: ObjectId("200000000000000000000001") },

  // 2. 更新動作 (Update Document)
  {
    $inc: { loginCount: 1 },                 // 不論新增或更新：登入次數 +1
    $set: { lastLogin: new Date() },          // 不論新增或更新：更新最後登入時間
    $setOnInsert: { createdAt: new Date() }  // ⭐️ 關鍵：僅在「首次新增」時寫入建立時間！
  },

  // 3. 選項 (Options)
  { upsert: true }
)
```

#### 關鍵運算子：`$setOnInsert` 的妙用
- **若是既有文件（Update 觸發）**：`$inc` 與 `$set` 會正常執行，但 `$setOnInsert` 裡的欄位會**被完全略過**，因此 `createdAt` 不會被無故洗掉。
- **若是全新文件（Insert 觸發）**：MongoDB 會將「Filter 的條件」＋「`$set`」＋「`$inc`」＋「`$setOnInsert`」全部合併為全新文件寫入。

#### 如何判讀執行結果？
MongoDB 的回應物件會明確告訴你是發生了 Update 還是 Insert：
- **觸發更新時**：`{ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }`
- **觸發新增時**：`{ matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: ObjectId(...) }`

---

#### 🚨 生產環境陷阱：為什麼 Upsert 必須建立唯一索引？
當兩個併發請求（例如使用者狂點按鈕兩下）在**同一微秒內**同時執行 Upsert 時：
1. 請求 A 檢查發現文件不存在，準備執行 Insert。
2. 請求 B 也幾乎在同一時刻檢查，也發現文件不存在，也準備執行 Insert。
3. **如果沒有唯一索引**，MongoDB 會允許兩者皆寫入，集合內就會**出現兩筆相同 `userId` 的重複文件**！

**正確解法**：
```javascript
// 1. 先為業務唯一鍵建立 Unique 索引
db.user_stats.createIndex({ userId: 1 }, { unique: true })
```
建立唯一索引後，若遇到上述高併發，其中一個請求會成功插入，另一個請求則會拋出 `E11000 duplicate key error`。後端程式碼只要捕捉該例外並簡單進行**重試（Retry）**，第二次執行時因文件已被先前的請求建立，就會自動安全地轉為 Update 流程！


## 5. Delete 與驗證

```javascript
db.crud_practice.deleteOne({_id: demoId}) // deletedCount: 1
```

`deleteMany({})` 會刪除整個集合內的文件；使用前先以相同條件 find/count，確認目標。

[實作環境](lab.md)的 `crud-checks.js` 驗證 null 語意、增查改刪、庫存不足與 regex 字面搜尋，不更動商品資料。

## 練習與解答

**實戰思考題：**  
假設熱門商品目前在資料庫中**僅剩最後 1 件庫存（`stock = 1`）**。  
此時顧客 A 與顧客 B 在同一毫秒內同時點擊「立即購買」。很多初學者後端會寫出以下邏輯：

```javascript
// ❌ 直覺卻致命的寫法：先讀取、再程式判斷、再扣減
const product = await db.products.findOne({ _id: prodId });

if (product.stock >= 1) {
  // 檢查通過，發送更新指令扣減庫存
  await db.products.updateOne({ _id: prodId }, { $inc: { stock: -1 } });
  console.log("扣款成功，準備出貨！");
} else {
  console.log("庫存不足！");
}
```

**問題：** 為什麼上述「先讀後扣」的邏輯在高併發下完全不可靠？底層會引發什麼嚴重災難？

??? success "點擊查看解答與時序拆解"
    ### 1. 致命缺陷：TOCTOU 競爭條件（Time-of-Check to Time-of-Use）
    在分散式與多執行緒環境中，「**檢查庫存（Check）**」與「**執行扣庫存（Use）**」之間存在微秒級的時間差。底層交錯時序如下：

    | 時間序 | 顧客 A 的執行緒 | 顧客 B 的執行緒 | 資料庫實際 stock |
    | :--- | :--- | :--- | :--- |
    | $T_1$ | 執行 `findOne`，讀到 `stock: 1` | | `1` |
    | $T_2$ | *(正在進行商業邏輯或網路傳輸)* | 執行 `findOne`，**也讀到 `stock: 1`** | `1` |
    | $T_3$ | 通過 `if (stock >= 1)`，執行 `$inc: -1` | 通過 `if (stock >= 1)` 檢查 | `0`（顧客 A 扣減） |
    | $T_4$ | 提示顧客 A 購買成功 | 執行 `$inc: -1`，**庫存被扣成負數** | **`-1`（超賣發生！）** |

    💥 **慘烈後果**：兩位顧客都顯示扣款成功，但倉庫只有 1 件商品，引發嚴重的**電商超賣（Overselling）客訴與財務損失**！

    ---

    ### 2. 正確解法：原子條件式更新（Atomic Conditional Update）
    不要在應用程式記憶體中做判斷，而是**將業務條件直接下推到 MongoDB 的查詢 Filter 中**，讓檢查與扣減在資料庫引擎層「一次原子完成」：

    ```javascript
    // ✅ 正確做法：利用 Filter 保證原子扣減
    const result = await db.products.updateOne(
      { 
        _id: prodId, 
        stock: { $gte: 1 } // ⭐️ 關鍵：只有當庫存仍大於等於 1 時才允許扣減！
      },
      { 
        $inc: { stock: -1 },
        $currentDate: { updatedAt: true }
      }
    );

    // 依據 matchedCount 判斷是否真正搶到庫存
    if (result.matchedCount === 1) {
      console.log("搶購成功，庫存扣減完成！");
    } else {
      // 若已被別人搶先扣走，條件不符合，matchedCount 為 0
      throw new Error("手腳太慢！商品已被搶購一空。");
    }
    ```
    - 顧客 A 扣減時：`stock` 為 1，符合條件，`matchedCount: 1`，庫存變 0。
    - 顧客 B 扣減時：`stock` 已為 0，不符合 `{stock: {$gte: 1}}`，MongoDB 根本不執行更新，直接回傳 `matchedCount: 0`！
    - **保證庫存絕對不可能被扣成負數，彻底杜絕超賣！**

