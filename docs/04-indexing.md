# Level 4：索引與效能調校

**前置條件：** 一般本機環境可連線。本章腳本自行重建教學資料庫中的 `index_lab` 集合，其他集合不受影響。

## 1. 索引的效益與成本

MongoDB 一般索引使用 B-tree。索引能縮小搜尋範圍或提供排序，但查詢成本仍取決於掃描鍵數、文件數、回傳量與資料分布；有索引不代表一定使用，也不能把整個查詢成本一律視為 O(log N)。

| 類型 | 用途 | 限制與代價 |
| --- | --- | --- |
| 單欄位／複合 | 篩選與排序 | 增加寫入與儲存成本；欄位順序影響可用前綴 |
| unique | 唯一性約束 | 建立時既有重複值會失敗；注意 null／缺少欄位 |
| multikey | 陣列欄位 | 複合索引有陣列限制，不能任意組合多個獨立陣列 |
| TTL | Date 欄位過期清理 | 背景非即時刪除；不要把它當成精確到秒的授權過期檢查 |
| partial | 只索引符合條件的文件 | 查詢條件需能符合索引的過濾範圍 |

示範語法：

```javascript
db.user_stats.createIndex({userId: 1}, {unique: true})
db.products.createIndex({tags: 1})
db.sessions.createIndex({createdAt: 1}, {expireAfterSeconds: 3600})
```

應用程式仍需檢查 session 是否到期；TTL 可能尚未刪除文件。

## 2. ESR 是起點，不是定律

等值（Equality）→ 排序（Sort）→ 範圍（Range）通常能避免額外排序。若範圍條件選擇性極高，ERS 可能減少更多掃描，但要付出排序成本；用自己的查詢比較。

```javascript
db.orders.createIndex({status: 1, createdAt: -1, _id: -1, totalAmount: 1})
```

status 先限制範圍，createdAt 和 _id 提供穩定排序，totalAmount 為範圍條件。這個索引不代表所有只查 totalAmount 的請求都有效率。

## 3. 可重現的 explain 對照

```javascript
--8<-- "examples/mongosh/indexing.js"
```

執行方式見[驗證流程](lab.md)。腳本每次重建 10,000 筆固定資料，並確認前後都回傳 10 筆、建索引後檢查的文件更少。後半使用 hint 隔離比較指定索引；實際調校還要觀察不加 hint 時 optimizer 的選擇。

| 指標 | 如何解讀 |
| --- | --- |
| nReturned | 最終回傳筆數 |
| totalDocsExamined | 檢查的文件數，不是實際磁碟讀取次數，資料可能來自快取 |
| totalKeysExamined | 掃描的索引鍵數，應與回傳量及查詢語意一起比較 |
| COLLSCAN | 集合掃描；小集合或需讀大部分資料時不一定不好 |
| IXSCAN／FETCH | 索引掃描／取得文件 |
| SORT | 額外排序；不一定全在記憶體，需看是否落盤與相關統計 |

不要依單次 executionTimeMillis 判斷優劣；快取、資料量與測量噪音都會影響結果。執行計畫的巢狀結構亦會隨版本與引擎改變。

## 4. 覆蓋查詢

```javascript
db.products.createIndex({category: 1, price: 1})
db.products.find(
  {category: "周邊配備"},
  {category: 1, price: 1, _id: 0}
).explain("executionStats")
```

若條件與投影都能由該索引滿足，可不讀文件，totalDocsExamined=0。索引頁本身仍可能需要磁碟 I/O，所以「覆蓋」不等於完全沒有磁碟讀取。涉及陣列、null 或分片等情境時還有額外限制。

## 練習與解答

**練習：** 覆蓋查詢 totalDocsExamined 小於 nReturned，是否代表資料少讀了？

??? success "解答"
    不是。索引已提供所需欄位，文件掃描可以是 0。應看正確結果與計畫，不能把 totalDocsExamined=nReturned 當成所有查詢唯一理想狀態。

參考：[ESR](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/)、[Explain](https://www.mongodb.com/docs/manual/reference/explain-results/)、[TTL](https://www.mongodb.com/docs/manual/core/index-ttl/)。
