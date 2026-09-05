# Level 6：.NET (C#) 實戰整合 (C# + MongoDB)

在 .NET 生態系中，MongoDB 官方維護了極為優秀且成熟的 **`MongoDB.Driver`**。它具備強型別 POCO（Plain Old CLR Object）自動對映、LINQ 查詢表達式支援，以及現代非同步（`async/await`）架構。

---

## 1. 必備套件安裝 (NuGet)

在 .NET 8 / 9 專案中，透過 .NET CLI 安裝官方核心驅動：

```bash
dotnet add package MongoDB.Driver
```

---

## 2. 實體模型對映 (POCO & BSON Attributes)

MongoDB Driver 能自動將 C# 類別轉換為 BSON 文件。透過 Attribute 標註，能完美控制欄位名稱與 ObjectId 的型別轉換：

```csharp
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

public class Product
{
    // 自動將 MongoDB 的 ObjectId 轉換為 C# 的 string
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("category")]
    public string Category { get; set; } = string.Empty;

    [BsonElement("price")]
    public decimal Price { get; set; }

    [BsonElement("stock")]
    public int Stock { get; set; }

    [BsonElement("tags")]
    public List<string> Tags { get; set; } = new();

    [BsonElement("createdAt")]
    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

!!! tip "忽略未知欄位"
    可在類別上方加上 `[BsonIgnoreExtraElements]`，避免當資料庫中的欄位比 C# 模型多時拋出反序列化例外。

---

## 3. ASP.NET Core 依賴注入 (DI) 最佳實踐

!!! warning "MongoClient 生命週期守則"
    **`MongoClient` 物件內部維護了連線池 (Connection Pool)，在應用程式生命週期內必須註冊為「Singleton (單例模式)」！** 切勿在每次請求時重複 `new MongoClient()`，否則會迅速耗盡 TCP 連線。

在 `appsettings.json` 中配置連線資訊：
```json
{
  "MongoSettings": {
    "ConnectionString": "mongodb://admin:password123@localhost:27017/?authSource=admin",
    "DatabaseName": "store_db"
  }
}
```

在 `Program.cs` 註冊服務：
```csharp
builder.Services.AddSingleton<IMongoClient>(sp =>
{
    var connectionString = builder.Configuration["MongoSettings:ConnectionString"];
    return new MongoClient(connectionString);
});

builder.Services.AddScoped(sp =>
{
    var client = sp.GetRequiredService<IMongoClient>();
    var dbName = builder.Configuration["MongoSettings:DatabaseName"];
    return client.GetDatabase(dbName);
});
```

---

## 4. 強型別 CRUD 實戰

### A. 新增 (Create)
```csharp
public async Task CreateProductAsync(IMongoDatabase db, Product product)
{
    var collection = db.GetCollection<Product>("products");
    await collection.InsertOneAsync(product);
    Console.WriteLine($"成功建立商品，ID 為：{product.Id}");
}
```

### B. 讀取 (Read) - 兩種寫法：強型別 Builders 與 LINQ

```csharp
var collection = db.GetCollection<Product>("products");

// 寫法 1：使用 Builders 強型別過濾器 (效能極佳、語意精確)
var filterBuilder = Builders<Product>.Filter;
var filter = filterBuilder.Eq(x => x.Category, "周邊配備") &
             filterBuilder.Gte(x => x.Price, 1000);

var products = await collection.Find(filter)
                               .SortByDescending(x => x.Price)
                               .Skip(0)
                               .Limit(10)
                               .ToListAsync();

// 寫法 2：使用 LINQ 查詢語法 (C# 開發者最熟悉的語法)
var linqProducts = await collection.AsQueryable()
                                   .Where(p => p.Category == "周邊配備" && p.Price >= 1000)
                                   .OrderByDescending(p => p.Price)
                                   .Take(10)
                                   .ToListAsync();
```

### C. 更新 (Update)
```csharp
// 原子更新：調降價格並扣減庫存
var filter = Builders<Product>.Filter.Eq(x => x.Id, productId);
var update = Builders<Product>.Update
    .Set(x => x.Price, 2990)
    .Inc(x => x.Stock, -1)
    .AddToSet(x => x.Tags, "促銷中");

var result = await collection.UpdateOneAsync(filter, update);
Console.WriteLine($"修改成功，影響筆數: {result.ModifiedCount}");
```

### D. 刪除 (Delete)
```csharp
var deleteFilter = Builders<Product>.Filter.Eq(x => x.Id, productId);
await collection.DeleteOneAsync(deleteFilter);
```

---

## 5. 多文件交易 (ACID Transactions in C#)

當需要在多個集合間維護交易一致性時，使用 `IClientSessionHandle`：

```csharp
public async Task TransferBalanceAsync(IMongoClient client, string fromId, string toId, decimal amount)
{
    using var session = await client.StartSessionAsync();

    // 透過 WithTransactionAsync 執行交易 (自動處理重試與例外復原)
    await session.WithTransactionAsync(async (s, cancellationToken) =>
    {
        var users = client.GetDatabase("bank_db").GetCollection<User>("users");

        // 1. 扣除轉出帳戶餘額
        var deductFilter = Builders<User>.Filter.Eq(u => u.Id, fromId) &
                           Builders<User>.Filter.Gte(u => u.Balance, amount);
        var deductUpdate = Builders<User>.Update.Inc(u => u.Balance, -amount);
        var deductRes = await users.UpdateOneAsync(s, deductFilter, deductUpdate, cancellationToken: cancellationToken);

        if (deductRes.ModifiedCount == 0)
        {
            throw new InvalidOperationException("餘額不足或帳戶不存在，交易中斷！");
        }

        // 2. 增加轉入帳戶餘額
        var addFilter = Builders<User>.Filter.Eq(u => u.Id, toId);
        var addUpdate = Builders<User>.Update.Inc(u => u.Balance, amount);
        await users.UpdateOneAsync(s, addFilter, addUpdate, cancellationToken: cancellationToken);

        return "交易成功";
    });
}
```

---

## 6. 乾淨架構：Repository Pattern 實戰封裝

在實際 Web API 專案中，通常會以泛型 Repository 封裝底層集合操作：

```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(string id);
    Task<IEnumerable<T>> GetAllAsync();
    Task CreateAsync(T entity);
    Task<bool> UpdateAsync(string id, T entity);
    Task<bool> DeleteAsync(string id);
}

public class MongoRepository<T> : IRepository<T> where T : class
{
    private readonly IMongoCollection<T> _collection;

    public MongoRepository(IMongoDatabase database, string collectionName)
    {
        _collection = database.GetCollection<T>(collectionName);
    }

    public async Task<T?> GetByIdAsync(string id)
    {
        var filter = Builders<T>.Filter.Eq("_id", new ObjectId(id));
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<IEnumerable<T>> GetAllAsync()
    {
        return await _collection.Find(_ => true).ToListAsync();
    }

    public async Task CreateAsync(T entity)
    {
        await _collection.InsertOneAsync(entity);
    }

    public async Task<bool> UpdateAsync(string id, T entity)
    {
        var filter = Builders<T>.Filter.Eq("_id", new ObjectId(id));
        var result = await _collection.ReplaceOneAsync(filter, entity);
        return result.ModifiedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var filter = Builders<T>.Filter.Eq("_id", new ObjectId(id));
        var result = await _collection.DeleteOneAsync(filter);
        return result.DeletedCount > 0;
    }
}
```
