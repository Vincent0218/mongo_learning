# 搜尋專題：全文、子字串與向量搜尋

**目標：** 區分字面包含、斷詞檢索與向量相似度，建立與查詢相符的索引。一般本機環境能練習 regex；本課程的 `mongo:7.0` Compose 沒有 Search 服務，不能直接執行 `$search`／`$vectorSearch`。

!!! warning "環境提醒：Atlas Search 僅適用於 MongoDB Atlas 雲端版"
    本章後續介紹的 `$search` 與 `$vectorSearch` 深度整合了 Apache Lucene 引擎，**僅能在 MongoDB Atlas (雲端託管版)** 運行。
    本地 Community Docker 環境不支援 `$search` 運算符（執行會回傳 `Unrecognized pipeline stage: '$search'`）。
    若您目前使用本地 Docker 練習，請直接參考 [第 2 節：本機可跑：字面包含搜尋](#2) 的原生 `$regex` 查詢。

## 1. 先選搜尋語意

| 需求 | 方法 | 注意事項 |
| --- | --- | --- |
| SKU／分類精確相等 | 一般等值查詢；Search 中使用 token + equals | 大小寫及 normalization 需明確定義 |
| 任意位置包含文字 | 跳脫後的 regex；或 keyword + wildcard | 前置萬用字元可能昂貴，需實測 |
| 中文全文相關度 | CJK analyzer + text | 是詞項匹配，不是理解自然語言語意 |
| 打字補全 | autocomplete 索引 | minGrams、tokenization 會影響短詞命中 |
| 語義相近 | 向量索引 + vectorSearch | 效果取決於向量模型、資料與召回設定 |

Search 使用 Lucene 及獨立索引處理。索引更新是最終一致：剛寫入的文件可能暫時搜尋不到，不能取代需要即時正確結果的庫存或權限檢查。[官方索引一致性說明](https://www.mongodb.com/docs/atlas/atlas-search/manage-indexes/)

## 2. 本機可跑：字面包含搜尋

以下在已匯入 seed 的 mongosh 執行：

```javascript
db.products.find({name: {$regex: "降噪", $options: "i"}}, {name: 1, _id: 0})
// 無線降噪耳機
```

動態輸入中的 `.`、`+`、`(` 等不是普通字元，必須跳脫。以下是 API 片段，collection/col 為既有集合；各語言的完整入口已包含 `A+B.` 測例。

=== "Python"

    ```python
    import re
    pattern = re.compile(re.escape(keyword), re.IGNORECASE)
    results = list(collection.find({"name": pattern}).limit(20))
    ```

=== "C#"

    ```csharp
    using System.Text.RegularExpressions;
    var filter = Builders<Product>.Filter.Regex(
        p => p.Name, new BsonRegularExpression(Regex.Escape(keyword), "i"));
    var results = await collection.Find(filter).Limit(20).ToListAsync();
    ```

=== "Go v2"

    ```go
    // imports: regexp, go.mongodb.org/mongo-driver/v2/bson
    filter := bson.M{"name": bson.Regex{Pattern: regexp.QuoteMeta(keyword), Options: "i"}}
    cursor, err := col.Find(ctx, filter, options.Find().SetLimit(20))
    ```

業務應限制空字串、輸入長度和結果數。區分大小寫的固定前綴 regex 可能利用索引邊界；任意包含或忽略大小寫不保證同樣有效。不要把所有 contains 查詢都斷言為 COLLSCAN，也不要只看 IXSCAN 就認定掃描量少。[官方 regex 索引行為](https://www.mongodb.com/docs/manual/reference/operator/query/regex/)

## 3. Search 環境與索引建立

使用已有的 Atlas 或其他相容 Search 部署，不必為本課程建立付費資源。先確認部署支援所用功能，再匯入同一份種子資料；這會覆蓋固定的教學 ID，所以只在專用教學資料庫操作。

在本機已安裝 mongosh 的 PowerShell 中：

```powershell
# 先將教學部署的連線字串放入 MONGO_SEARCH_URI；不要提交含密碼的 URI。
mongosh $env:MONGO_SEARCH_URI --quiet examples/mongosh/seed.js
```

在 Atlas 的 `mongo_learning_lab.products` 索引介面建立以下三個不同名稱的索引。前兩個選 Search 的 JSON editor；第三個選 Vector Search。不要將不同定義輪流覆蓋在 default 索引上。

### products_search：全文、補全及精確過濾

```json
--8<-- "examples/search/products-search.json"
```

`dynamic: false` 表示未宣告的欄位無法直接拿來搜尋；因此 category、sku、tags 都明確列出。string 搭配 `lucene.cjk` 適合做 CJK 詞項檢索，但不是所有繁體中文資料集的最佳選擇，仍需以自己的查詢集比較。

補全獨立使用 keyword analyzer 與 nGram，minGrams=2，使「降噪」這種兩字子字串有可索引的片段；單字「降」不在此設計的保證範圍。長字串受 maxGrams、分析器及 token 限制影響，不應承諾任意長度都能命中。[Autocomplete 索引設定](https://www.mongodb.com/docs/search/indexes/field-types/autocomplete-type/)

```javascript
db.products.aggregate([
  {$search: {index: "products_search", compound: {
    must: [{text: {query: "人體工學", path: ["name", "description"]}}],
    filter: [{equals: {path: "category", value: "周邊配備"}}],
    should: [{equals: {path: "tags", value: "辦公", score: {boost: {value: 3}}}}]
  }}},
  {$limit: 10},
  {$project: {name: 1, score: {$meta: "searchScore"}}}
])
```

預期結果包含人體工學鍵盤。text 使用分析後的詞項；不要把 must 中的一個 text 查詢解讀成「所有中文字逐字相連」。需要詞項順序可使用 phrase 與 slop，但其含義仍以分析器產生的 token 為準。

### products_substring：不分詞的 wildcard

```json
--8<-- "examples/search/products-substring.json"
```

```javascript
db.products.aggregate([
  {$search: {index: "products_substring", wildcard: {
    path: "name", query: "*降噪*", allowAnalyzedField: true
  }}},
  {$limit: 20}
])
```

預期包含無線降噪耳機。keyword analyzer 保留完整詞項；這個設定預設不做小寫化。動態輸入要另外跳脫 wildcard 的 `*`、`?`、反斜線，不能直接套 regex 的跳脫規則。長欄位及前置 wildcard 都應測量成本，不承諾百萬筆毫秒級。

## 4. products_vector：不用外部 API 的流程練習

```json
--8<-- "examples/search/products-vector.json"
```

seed 的四個商品帶有三維手工向量。它們只用來驗證索引、維度及查詢流程，並不具備「耳機適合通勤」的真實語義。

```javascript
db.products.aggregate([
  {$vectorSearch: {
    index: "products_vector", path: "embedding",
    queryVector: [1, 0, 0], numCandidates: 100, limit: 2
  }},
  {$project: {name: 1, score: {$meta: "vectorSearchScore"}}}
])
```

乾淨種子資料中，耳機向量與查詢相同，應排第一。ANN 仍是近似搜尋；正式資料集需評估 recall 與延遲。numCandidates 是候選數，不是維度；維度必須與索引設定一致。

真實語義搜尋需要以同一 embedding 模型與相同維度產生文件、查詢向量；模型變更時應重算文件向量並處理索引切換。向量檢索只是 RAG 的取回步驟，並不包含後續答案生成。

## 5. 驗證、限制與練習

等待三個索引皆 queryable，且資料已同步，再執行：

```powershell
mongosh $env:MONGO_SEARCH_URI --quiet examples/search/checks.js
```

腳本檢查 SKU 相等、兩字補全、category 過濾、wildcard 及向量第一名。尚在同步時可能失敗；先確認索引狀態與種子資料，再重試，不能把暫時缺資料解讀成索引配置必然錯誤。這部分需要額外 Search 環境；本機一般與 replica set 的測試不涵蓋 Search。

**練習：** 若輸入「降」沒有補全結果，是否應先修改查詢為 fuzzy？

??? success "解答"
    先檢查 minGrams。本例只索引至少兩字的片段；fuzzy 是編輯距離容錯，不會替代缺少的短詞索引。若產品要支援單字，應調整索引策略並評估索引大小與結果雜訊。

本機傳統 text index 的 default_language=none 只是停用 stemming 與停用詞處理，不會自動完成中文斷詞。若採應用層預斷詞，寫入與查詢必須使用一致策略，保留原文並用測例評估繁簡體及專有名詞。
