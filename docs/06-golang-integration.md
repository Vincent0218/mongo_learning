# Level 6：Go 實戰整合

**前置條件：** [一般及交易環境](lab.md)已初始化。Go 1.23 以上，MongoDB Go Driver v2.3.1；版本固定在 `examples/go/go.mod`，相依檢查碼在 go.sum。

## 1. 執行與 v2 差異

```powershell
Push-Location examples/go
go run .
go test -v ./...
Pop-Location
```

預期顯示三筆商品與 CRUD/regex passed，交易測試七個子案例全部 PASS。程式設連線與操作期限；連不上資料庫會回傳錯誤。

v1 import 路徑已棄用；v2 使用 `go.mongodb.org/mongo-driver/v2`。ObjectID／Regex 位於 bson，mongo.Connect 不再接受 context，交易 callback 使用帶 session 的 context.Context。[官方版本說明](https://www.mongodb.com/docs/drivers/go/v1.x/whats-new/)

## 2. BSON 結構與映射

| 型別 | 語意 | 使用場合 |
| --- | --- | --- |
| bson.M | 無序 map | 一般 filter 與更新 |
| bson.D | 有序的 bson.E slice | 多欄位 sort、命令文件 |
| bson.E | Key／Value 元素 | 組成 bson.D，範例使用具名欄位 |
| bson.A | BSON 陣列 | in、or 等陣列值 |
| mongo.Pipeline | stage 文件的 slice | stage 的先後由外層 slice 保證 |

Product 的 Price 是 int64（新台幣分），CreatedAt 映射到 createdAt。JSON API 若用字串 ID，輸入時用 bson.ObjectIDFromHex 並處理錯誤；不要將字串直接塞進 ObjectId filter。

## 3. 完整 CRUD、連線與交易程式

```go
--8<-- "examples/go/main.go"
```

Client 可供 goroutine 共用；session 不可跨 goroutine 同時操作。Ping 失敗會關閉 client，cursor 與 client 也有關閉流程。資料庫層回傳 error，只有入口決定結束程式，不在函式中 log.Fatal。

扣款 filter 同時檢查餘額，兩次更新都檢查 MatchedCount；原始 MongoDB error 原樣回傳，以保留 Driver 重試所需的標記。callback 可重跑，應避免外部副作用。金額與餘額假設在 int64 範圍內；正式系統另需上限與業務冪等性規則。

## 4. Pipeline 寫法

以下為查詢片段，接在已有 ctx、products 集合的程式中：

```go
pipeline := mongo.Pipeline{
    bson.D{{Key: "$group", Value: bson.D{
        {Key: "_id", Value: "$category"},
        {Key: "averagePrice", Value: bson.D{{Key: "$avg", Value: "$price"}}},
        {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
    }}},
    bson.D{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
}
cursor, err := products.Aggregate(ctx, pipeline)
```

此統計是商品平均售價與商品數，不能把商品 price 加總稱為「營收」。營收需依[訂單明細與數量](03-aggregation.md)計算。

## 練習與解答

**練習：** 為什麼不把所有扣款失敗都包成 errors.New("扣款失敗")？

??? success "解答"
    那會丟失資料庫錯誤型別及重試標記。先原樣回傳資料庫 error；只有未命中這種業務條件失敗才回傳 errTransferRejected。整合測試也分辨業務拒絕和意外的連線錯誤。

參考：[Go transactions](https://www.mongodb.com/docs/drivers/go/current/crud/transactions/)。
