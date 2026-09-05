# .NET C# 實戰整合

**前置條件：** [一般與交易環境](lab.md)已初始化。目標框架 .NET 8、MongoDB.Driver 3.5.0；套件固定在 `examples/dotnet/MongoLearning.csproj` 與 packages.lock.json。

## 1. 執行完整程式

```powershell
dotnet run --project examples/dotnet
dotnet run --project examples/dotnet -- --check
```

第一個命令用 LINQ 讀取三筆商品並驗證 CRUD 與字面 regex。第二個命令連到 27018，七種交易情境全部應顯示 PASS；若發生非預期錯誤會以失敗結束。

## 2. POCO 與欄位約定

BsonElement 決定儲存欄位名稱，Id 使用 ObjectId，price/balance 使用 long（新台幣分）。BsonIgnoreExtraElements 允許讀取共用資料中本例不需要的欄位。若 API 以字串傳 ID，應在入口 ObjectId.TryParse 並拒絕不合法輸入。

DateTime 儲存為 UTC。若金額改用 decimal，應明確定義 BSON Decimal128 映射與跨語言轉換；本課程統一用整數分。

## 3. 可執行 CRUD、LINQ 與交易

以下為可直接執行的完整程式碼（包含 POCO 定義、LINQ 查詢與完整交易驗證）：

??? example "點擊展開查看完整原始碼：examples/dotnet/Program.cs"
    ```csharp
    --8<-- "examples/dotnet/Program.cs"
    ```

LINQ 使用 MongoDB.Driver.Linq 的擴充方法，查詢會由 Driver 轉成資料庫操作；不是所有 .NET 方法都可翻譯。Filter/Update Builders 適合明確表達條件更新。範例傳入 CancellationToken，讓操作可以配合服務的取消期限。

## 4. Web 服務的 Client 生命週期

以下為 ASP.NET Core 設定片段；此課程的執行入口是 console，不額外建立 Web 服務：

```csharp
builder.Services.AddSingleton<IMongoClient>(_ =>
    new MongoClient(builder.Configuration.GetConnectionString("Mongo")));
builder.Services.AddSingleton<IMongoDatabase>(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("mongo_learning_lab"));
```

共用 Client 的連線池，不要每次請求建立一個。正式 URI 從設定或祕密管理載入，不把密碼放進版本庫。

## 5. 交易與封裝取捨

!!! info "交易環境連線提醒"
    多文件 ACID 交易**僅能**在 [交易環境 (Replica Set)](lab.md#2-replica-set)（連接埠 `27018`，免帳密，帶 `replicaSet=rs0&directConnection=true`）執行。一般環境（`27017` Standalone）不支援交易操作。

WithTransactionAsync 的 callback 可能重試；不要吞掉資料庫例外或在其中發送外部通知。matchedCount=0 是業務失敗，需要主動拋例外才能觸發 Rollback（撤銷交易）。測試中的「收款帳戶不存在」會先扣款再失敗，確認交易能撤銷扣款。

本例用 Transfers 封裝完整業務操作。若另加 Repository，不宜只提供無上限 GetAll 或把所有更新都包成 ReplaceOne；應保留有界查詢、條件更新、session 及取消能力。ReplaceOne 會移除未傳入的欄位；ModifiedCount=0 也可能只是值相同。

金額與加總假設在 long 範圍內。重複業務請求、授權和金額上限需另外設計；交易原子性不會自動處理這些需求。

## 練習與解答

**練習：** 已查出帳戶存在，是否能省略入帳後的 MatchedCount？

??? success "解答"
    不應省略。更新結果才反映該次寫入是否命中；未命中並不會自動拋例外。保留檢查才能讓交易中的業務條件失敗時觸發 Rollback。

參考：[C# transactions](https://www.mongodb.com/docs/drivers/csharp/current/fundamentals/transactions/)。
