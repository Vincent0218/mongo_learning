# 進階專題：MongoDB Atlas Search (全文檢索與向量搜尋)

在過去，若應用程式需要強大的搜尋功能（例如打字自動補全、錯字容忍、繁簡中文分詞、相關度權重排序），架構師往往必須在 MongoDB 旁邊額外架設一座 **Elasticsearch** 叢集，並透過 CDC 工具（如 Debezium、Kafka）同步資料。

**MongoDB Atlas Search** 徹底顛覆了這種複雜架構：它直接將業界標準的 **Apache Lucene 搜尋引擎**深植於 MongoDB 之中，無需維運額外叢集，也無資料同步延遲，且直接透過現有的聚合管道（`$search`）即可查詢！

```mermaid
flowchart LR
    subgraph 傳統架構 [繁複的傳統架構]
        DB[(MongoDB)] -->|CDC / Kafka / Logstash| Sync[同步管道]
        Sync --> ES[(Elasticsearch 叢集)]
        App1[應用程式] -->|CRUD| DB
        App1 -->|搜尋| ES
    end

    subgraph Atlas架構 [現代 Atlas Search 架構]
        App2[應用程式] -->|單一連線 / $search| Atlas[(MongoDB Atlas<br/>內嵌 Apache Lucene 引擎)]
    end

    style Atlas fill:#e0f2f1,stroke:#00796b,stroke-width:2px;
    style ES fill:#ffebee,stroke:#c62828;
```

---

## 1. 傳統 `$text` 索引 vs Atlas Search

| 特性比較 | 傳統 MongoDB `$text` 索引 | 現代 Atlas Search (`$search`) |
| :--- | :--- | :--- |
| **底層技術** | MongoDB 內建簡單反向索引 | **Apache Lucene 完整搜尋引擎** |
| **中文分詞支援** | 弱（無空格分詞困難，需設為 `none`） | **強大（內建 `lucene.cjk`、`lucene.smartcn`、自訂 N-gram）** |
| **錯字容錯 (Fuzzy Search)** | ❌ 不支援 |  支援（設定 `fuzzy: { maxEdits: 2 }`） |
| **精確 Keyword 匹配** | 依賴一般 B-Tree 索引 |  **原生 `token` 索引與多重分析器支援** |
| **自動補齊 (Autocomplete)** | ❌ 困難且效能差 |  原生專用分詞器，體驗極佳 |
| **向量檢索 (Vector Search)** | ❌ 不支援 |  **支援 AI 向量搜尋與 RAG 架構** |
| **計分調權 (Scoring / Boost)** | 陽春 |  支援強大的 BM25 演算法與動態評分權重 |

---

## 2. 🀄 中文語系全文檢索核心實踐

英文單字以空格自然分開，但中文語句「**無線藍牙降噪耳機**」沒有空格，若使用預設的 `lucene.standard` 分詞器，常會將中文拆成單個孤立字元，導致搜尋不精準或召回率（Recall）過低。

### A. Atlas Search 支援的中文分析器 (Analyzers)

1. **`lucene.cjk`（中日韓雙字切詞，最推薦繁體中文使用）**：
   - 採用 **Bi-gram (2-gram)** 雙字滑動分詞。
   - 「無線降噪」會切成：`["無線", "線降", "降噪"]`。
   - **優點**：不依賴簡體詞典，對繁體中文、人名、專有名詞的搜尋覆蓋率極高！
2. **`lucene.smartcn`（Smart Chinese 智慧分析器）**：
   - 內建大型中文詞典與隱馬爾可夫模型（HMM），偏向簡體中文分詞。
3. **自訂 N-Gram 分析器（任意子字串命中）**：
   - 可設定 `minGram: 1, maxGram: 2`，無論使用者搜尋單字或雙字關鍵字都能 100% 命中。

### B. 支援中文與 Keyword 的搜尋索引 JSON 配置

以下是在 Atlas 建立 Search Index 的黃金範例配置，同一個欄位同時支援**中文全文檢索**、**即時自動補全**與**不分詞精確 Keyword 比對**：

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": [
        {
          "type": "string",
          "analyzer": "lucene.cjk"
        },
        {
          "type": "autocomplete",
          "analyzer": "lucene.cjk"
        }
      ],
      "description": {
        "type": "string",
        "analyzer": "lucene.cjk"
      },
      "sku": {
        "type": "token"
      },
      "tags": {
        "type": "string",
        "analyzer": "lucene.keyword"
      }
    }
  }
}
```

- **`type: "token"` 或 `analyzer: "lucene.keyword"`**：
  整串字串視為單一整體（不拆詞、不轉小寫）。適用於 SKU 商品編號、訂單號碼、狀態碼或專屬標籤。

---

## 3. 🔍 中文關鍵字與 Keyword 搜尋實戰

### A. 中文全文語意檢索 (`text` 運算符)
使用者輸入「降噪耳機」，Lucene 會利用 CJK 分析器拆解匹配，並按照相關度（BM25 Score）由高至低排列：

```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      text: {
        query: "降噪耳機",
        path: ["name", "description"]
      }
    }
  },
  {
    $project: {
      name: 1,
      price: 1,
      score: { $meta: "searchScore" }
    }
  }
]);
```

### B. 中文連續片語精確比對 (`phrase` 運算符)
要求關鍵字必須「相連且順序一致」（例如必須剛好包含「人體工學」，不可被其他字中斷）：

```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      phrase: {
        query: "人體工學",
        path: "description",
        slop: 0 // 允許中間插入的單詞數，0 代表嚴格相連
      }
    }
  }
]);
```

### C. 精確 Keyword 匹配 (`equals` 運算符)
針對定義為 `type: "token"` 的 `sku` 或 `tag` 欄位進行嚴格匹配，相當於全文引擎裡的精準查詢：

```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      equals: {
        path: "sku",
        value: "TECH-2026-EAR-01"
      }
    }
  }
]);
```

### D. 中文搜尋框打字即時補全 (`autocomplete`)
輸入 `藍牙`，即時反饋包含「藍牙接收器」、「藍牙立體聲耳機」：

```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      autocomplete: {
        query: "藍牙",
        path: "name",
        tokenOrder: "any"
      }
    }
  },
  { $limit: 5 },
  { $project: { name: 1 } }
]);
```

### E. 複合搜尋：中文關鍵字 + Keyword 標籤過濾 + 評分加權
業界電商搜尋最經典的「複合搜尋模型」：

```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      compound: {
        must: [
          // 1. 必備條件：商品名稱必須匹配中文「機械鍵盤」
          {
            text: {
              query: "機械鍵盤",
              path: "name"
            }
          }
        ],
        should: [
          // 2. 加分條件：若含有「無線」標籤，大幅提高排序權重 (Boost x 3)
          {
            text: {
              query: "無線",
              path: "tags",
              score: { boost: { value: 3 } }
            }
          }
        ],
        filter: [
          // 3. 嚴格過濾：分類必須是「周邊配件」（不影響評分）
          {
            phrase: {
              query: "周邊配件",
              path: "category"
            }
          }
        ]
      }
    }
  },
  { $limit: 10 }
]);
```

---

## 4. 🎯 特殊場景：免分詞！任意長度 Keyword 子字串匹配 (Substring Match)

若您的業務情境**完全不需要詞典分詞**，也不需要繁簡轉換，而是希望達到類似 SQL 的 `LIKE '%關鍵字%'`——**只要文件包含該段「任意長度」的字串，就必須精準找出文件**，以下為業界三大最優實作策略：

```mermaid
graph TD
    Req["需求：免分詞、免詞典<br/>任意長度 Keyword 包含匹配"] --> Choice{資料量大小？}
    Choice -->|中小資料量<br/>或本機 MongoDB| DirectRegex["策略 1：原生 $regex 查詢<br/>免建額外索引，隨寫隨用"]
    Choice -->|海量資料 / 百萬級<br/>需毫秒級高速回應| LuceneWildcard["策略 2：Atlas Search + wildcard<br/>(以 lucene.keyword 不分詞索引搭配萬用字元)"]
    Choice -->|高頻全文搜尋體驗| NGram["策略 3：N-Gram 切片索引<br/>(按固定字元長度切片，無字典偏誤)"]

    style DirectRegex fill:#e3f2fd,stroke:#1565c0;
    style LuceneWildcard fill:#e8f5e9,stroke:#2e7d32;
    style NGram fill:#fff3e0,stroke:#e65100;
```

---

### 策略 1：MongoDB 原生 `$regex`（免 Atlas、通用性最高）

如果您不需要複雜的搜尋引擎評分，只想要精準找出包含特定字串的文件，直接使用 MongoDB 原生查詢運算符即可，**任何版本（本機 Docker、任何雲端環境）皆能執行**：

```javascript
// 尋找 name 欄位包含任意長度 keyword 的文件
// $options: "i" 代表忽略大小寫 (case-insensitive)
db.products.find({
  name: { $regex: "任意長度Keyword", $options: "i" }
});
```

#### 各語言原生實作範例：
=== "Python (PyMongo)"
    ```python
    import re

    keyword = "降噪"
    # 使用 re.compile 搭配 re.IGNORECASE
    regex_pattern = re.compile(re.escape(keyword), re.IGNORECASE)
    results = list(db.products.find({"name": regex_pattern}))
    ```

=== ".NET (C#)"
    ```csharp
    using MongoDB.Bson;
    using MongoDB.Driver;

    string keyword = "降噪";
    // 建立正則表達式過濾器
    var filter = Builders<Product>.Filter.Regex(
        x => x.Name,
        new BsonRegularExpression(keyword, "i")
    );
    var results = await collection.Find(filter).ToListAsync();
    ```

=== "Golang"
    ```go
    keyword := "降噪"
    filter := bson.M{
        "name": primitive.Regex{Pattern: keyword, Options: "i"},
    }
    cursor, err := col.Find(ctx, filter)
    ```

!!! warning "原生 `$regex` 的效能考量"
    - **前綴匹配（Prefix Match）**：若搜尋條件是 `^關鍵字`，且該欄位建有標準 B-Tree 索引，MongoDB **可以直接走 `IXSCAN`（索引掃描）**，速度極快。
    - **任意位置匹配（Contains Match）**：若在中間或結尾（包含搜尋），傳統 B-Tree 索引無法利用最左前綴，會退化為全表掃描（`COLLSCAN`）。資料量超過十萬筆時，強烈建議使用下方的 **策略 2（Atlas Search）**。

---

### 策略 2：Atlas Search `wildcard`（百萬級海量資料首選）

在 Atlas Search 中，可將欄位設定為 **不分詞（`lucene.keyword`）**，讓文字完全保持原始長度與內容，再透過 **`wildcard`** 運算符以萬用字元 `*` 匹配任意長度子字串：

#### 1. 索引配置（將分析器設為不分詞的 `lucene.keyword`）：
```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": {
        "type": "string",
        "analyzer": "lucene.keyword"
      }
    }
  }
}
```

#### 2. 查詢語法（前後加上 `*` 實現任意長度命中）：
```javascript
db.products.aggregate([
  {
    $search: {
      index: "default",
      wildcard: {
        query: "*降噪*",               // 只要包含「降噪」即命中
        path: "name",
        allowAnalyzedField: true
      }
    }
  },
  { $limit: 20 }
]);
```
- **優勢**：由 Lucene 核心倒排索引加速，即使是百萬筆資料也能在毫秒內快速定位，完全不依賴字典，精準無失真！

---

## 5. 傳統 MongoDB 本地環境 `$text` 索引的中文技巧

如果您目前是在本地 Docker 環境運行標準 MongoDB（非 Atlas 雲端），傳統的 `$text` 索引因為缺乏內建中文詞典，預設會將中文長句當作單一英文字詞處理。

### 本地環境解法：
1. **建立索引時指定 `default_language: "none"`**：
   ```javascript
   // 關閉英文詞幹還原 (Stemming) 與停用詞過濾
   db.articles.createIndex(
     { title: "text", content: "text" },
     { default_language: "none" }
   );
   ```
2. **應用層分詞預處理（最推薦做法）**：
   在將資料存入 MongoDB 之前，在後端使用 **Jieba（結巴分詞）** 將字串預先切詞並以空白分隔或存成標籤陣列：
   - 原始內容：「這是一款超耐用的防水藍牙耳機」
   - 儲存內容：「這 是 一款 超 耐用 的 防水 藍牙 耳機」
   - 這樣即使使用本地 MongoDB 的 `$text` 也能享有完美的中文關鍵字查詢！

---

## 6. 現代 AI 核心：Atlas Vector Search (向量語義檢索)

當關鍵字無法精確表達使用者意圖時（例如使用者搜尋：「*想找適合在捷運上聽音樂不被干擾的裝備*」），字面完全沒有「耳機」或「降噪」二字，傳統關鍵字搜尋會掛零。此時需要 **向量語義搜尋**：

```mermaid
flowchart LR
    UserQuery[自然語言：'捷運通勤聽歌不被吵到'] --> Embed[OpenAI Embedding 向量化]
    Embed --> Vector[[0.012, -0.043, 0.089, ...]]
    Vector --> VSearch["$vectorSearch 向量檢索<br/>(理解其語意接近降噪耳機)"]
    VSearch --> Result[(精準推薦降噪耳機商品)]

    style VSearch fill:#e8f5e9,stroke:#2e7d32;
    style Result fill:#ede7f6,stroke:#512da8;
```

```javascript
db.products.aggregate([
  {
    $vectorSearch: {
      index: "vector_index",
      path: "embedding",
      queryVector: [0.0123, -0.0456, 0.0891, ...], // 自然語言轉換後的向量
      numCandidates: 100,
      limit: 5
    }
  },
  {
    $project: {
      name: 1,
      description: 1,
      similarity: { $meta: "vectorSearchScore" }
    }
  }
]);
```

---

## 7. 多語言中文搜尋呼叫範例

=== "Python (PyMongo)"
    ```python
    pipeline = [
        {
            "$search": {
                "index": "default",
                "text": {
                    "query": "人體工學 辦公椅",
                    "path": ["name", "description"]
                }
            }
        },
        {"$limit": 5}
    ]
    results = list(db.products.aggregate(pipeline))
    ```

=== ".NET (C#)"
    ```csharp
    var searchStage = new BsonDocument("$search", new BsonDocument
    {
        { "index", "default" },
        { "text", new BsonDocument
            {
                { "query", "人體工學 辦公椅" },
                { "path", new BsonArray { "name", "description" } }
            }
        }
    });

    var pipeline = new IPipelineStageDefinition[]
    {
        new SimplePipelineStageDefinition<Product, Product>(searchStage),
        PipelineStageDefinitionBuilder.Limit<Product>(5)
    };

    var results = await collection.Aggregate<Product>(pipeline).ToListAsync();
    ```

=== "Golang"
    ```go
    pipeline := mongo.Pipeline{
        {{"$search", bson.D{
            {"index", "default"},
            {"text", bson.D{
                {"query", "人體工學 辦公椅"},
                {"path", bson.A{"name", "description"}},
            }},
        }}},
        {{"$limit", 5}},
    }

    cursor, err := col.Aggregate(ctx, pipeline)
    ```
