# Level 1：核心觀念與環境架設

**目標：** 說明文件與關聯模型的差異，辨識 BSON 型別，完成一次連線與查詢。前置條件及所有環境命令見[實作環境](lab.md)。

## 1. RDBMS 與 MongoDB

| 關聯式資料庫 | MongoDB | 說明 |
| --- | --- | --- |
| Database | Database | 邏輯資料容器 |
| Table | Collection | 文件集合，可選擇加上 schema validation |
| Row | Document | BSON 文件，可包含內嵌文件與陣列 |
| Column | Field | 欄位名稱與值 |
| Primary key | `_id` | 預設常用 ObjectId，也可自行指定其他允許的型別 |
| JOIN | `$lookup`／內嵌 | 依存取模式選擇，並非所有 JOIN 都應改成內嵌 |

彈性 schema 不代表不需要資料模型。欄位命名、型別與關聯 ID 仍應一致，否則會增加查詢及跨語言轉換的成本。需要大量任意關聯、既有 SQL 工具或關聯約束時，應一併評估關聯式資料庫。

## 2. JSON 與 BSON

JSON 是文字交換格式；BSON 是 MongoDB 使用的二進位文件表示法，另支援 ObjectId、Date、int32、int64、Decimal128、Binary 等型別。BSON 並不保證比 JSON 更小，也不會單憑格式就讓查詢變快；存取模式和索引仍是關鍵。

```javascript
db.products.findOne({_id: ObjectId("100000000000000000000001")})
// price: 499000（新台幣分），createdAt: ISODate("2026-01-01T00:00:00Z")
```

字串 `"100000000000000000000001"` 與相同文字表示的 ObjectId 是不同 BSON 型別，查詢時不能互換。JSON 輸出給 API 用戶可轉成字串，讀回時需驗證並明確轉換。

### ObjectId 的 12 bytes

- 4 bytes：產生 ID 時的 Unix 秒級時間戳。
- 5 bytes：每個程序產生的隨機值。
- 3 bytes：從隨機起點遞增的計數器。

ObjectId 可在寫入之前由客戶端產生，因此其時間不是可靠的「資料入庫時間」。它也不保證跨程序嚴格按照建立順序排序；需要穩定排序時使用業務時間欄位加 `_id` 作為次排序鍵。教材的固定 ID 僅供重跑，不能用來推算日期。

## 3. 工具與第一個查詢

依[實作環境](lab.md)啟動服務、匯入資料，再進入 mongosh：

```javascript
show dbs
use mongo_learning_lab
show collections
db.products.find({}, {name: 1, price: 1, _id: 0}).sort({price: 1})
```

預期四筆商品，從充電器（89000 分）到螢幕（990000 分）。

Compass 使用同一連線字串，可視覺化檢查欄位、聚合管道及執行計畫。Mongo Express 是另一個本機 GUI；先確認目前選中的資料庫，再操作新增或刪除。

## 練習與解答

**練習：** 分別用字串與 ObjectId 查詢第一筆商品，觀察差異。

??? success "解答"
    `db.products.findOne({_id: "100000000000000000000001"})` 回傳 null；包成 ObjectId 才會命中。這是型別不一致，並非資料消失。

參考：[BSON types](https://www.mongodb.com/docs/manual/reference/bson-types/)、[ObjectId](https://www.mongodb.com/docs/manual/reference/method/ObjectId/)。
