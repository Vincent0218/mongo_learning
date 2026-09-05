# Level 6：Golang 實戰整合 (Go + MongoDB)

在 Go 語言中，高併發（Concurrency）與極致效能是最大優勢。MongoDB 官方提供了成熟且經過高度優化的官方驅動套件 **`mongo-go-driver`**。本章節將帶您深入掌握如何在 Go 中優雅且高效地操作 MongoDB。

---

## 1. 安裝官方驅動程式

在您的 Go 專案目錄下執行：

```bash
go get go.mongodb.org/mongo-driver/mongo
go get go.mongodb.org/mongo-driver/bson
go get go.mongodb.org/mongo-driver/mongo/options
```

---

## 2. 結構體模型定義 (Struct & BSON Tags)

Go 透過 Struct Tag 來定義 BSON 序列化規則。MongoDB 的 `_id` 在 Go 中對應的是 `primitive.ObjectID`：

```go
package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Product struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	Category  string             `bson:"category" json:"category"`
	Price     float64            `bson:"price" json:"price"`
	Stock     int                `bson:"stock" json:"stock"`
	Tags      []string           `bson:"tags,omitempty" json:"tags"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}
```

---

## 3. 重要核心：搞懂 BSON 四大資料型別

Go 是強型別語言，在建構查詢與更新條件時，必須理解 `bson` 套件提供的四種資料結構：

| 類型 | 底層定義 | 使用時機 | 範例 |
| :--- | :--- | :--- | :--- |
| **`bson.M`** | `map[string]interface{}` | **無序鍵值對**。最常用於一般的查詢條件與 `$set` 更新 | `bson.M{"status": "ACTIVE"}` |
| **`bson.D`** | `[]bson.E` (有序 Slice) | **嚴格保證鍵值順序**。用於多欄位排序、聚合管道 Stages | `bson.D{{"price", -1}, {"name", 1}}` |
| **`bson.E`** | `struct { Key string, Value interface{} }` | `bson.D` 內部的單個元素 | `bson.E{Key: "price", Value: 100}` |
| **`bson.A`** | `[]interface{}` | **BSON 陣列**。用於 `$or`、`$in` 等需要陣列的地方 | `bson.A{"筆電", "手機"}` |

---

## 4. 初始化連線與連線池管理

在 Go 中，`*mongo.Client` 內部已封裝執行緒安全（Thread-Safe）的連線池。**在整個應用程式中只需建立一個 Client 實例共用即可**：

```go
package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func ConnectDB(uri string) (*mongo.Client, error) {
	// 設定連線池參數與超時
	clientOptions := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(100).            // 最大連線數
		SetMinPoolSize(10).             // 最小維持連線
		SetMaxConnIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	// Ping 測試連線
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	log.Println("🍃 成功連線至 MongoDB！")
	return client, nil
}
```

---

## 5. 核心 CRUD 實戰程式碼

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// 1. 新增單筆 (Create)
func insertProduct(ctx context.Context, col *mongo.Collection) primitive.ObjectID {
	p := Product{
		Name:      "機械鍵盤 MX",
		Category:  "周邊配件",
		Price:     3890,
		Stock:     20,
		Tags:      []string{"辦公", "靜音"},
		CreatedAt: time.Now(),
	}

	res, err := col.InsertOne(ctx, p)
	if err != nil {
		log.Fatal(err)
	}
	return res.InsertedID.(primitive.ObjectID)
}

// 2. 查詢多筆與分頁 (Read)
func findProducts(ctx context.Context, col *mongo.Collection) ([]Product, error) {
	// 條件：價格 >= 1000
	filter := bson.M{"price": bson.M{"$gte": 1000}}

	// 排序 (使用 bson.D 保證順序) 與分頁
	opts := options.Find().
		SetSort(bson.D{{"price", -1}}).
		SetSkip(0).
		SetLimit(10)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []Product
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	return results, nil
}

// 3. 原子更新 (Update)
func updateStock(ctx context.Context, col *mongo.Collection, id primitive.ObjectID) error {
	filter := bson.M{"_id": id}
	update := bson.M{
		"$inc": bson.M{"stock": -1}, // 扣減庫存
		"$set": bson.M{"updated_at": time.Now()},
	}

	res, err := col.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}
	fmt.Printf("成功更新，影響筆數: %d\n", res.ModifiedCount)
	return nil
}

// 4. 刪除 (Delete)
func deleteProduct(ctx context.Context, col *mongo.Collection, id primitive.ObjectID) error {
	filter := bson.M{"_id": id}
	_, err := col.DeleteOne(ctx, filter)
	return err
}
```

---

## 6. 聚合管道 (Aggregation in Go)

在 Go 中撰寫 Aggregation 時，必須使用 `mongo.Pipeline`（由多個 `bson.D` 組成），以嚴格確保 Pipeline 各 Stage 的執行順序：

```go
func GetCategoryStats(ctx context.Context, col *mongo.Collection) error {
	// 建立 Pipeline：$match -> $group -> $sort
	pipeline := mongo.Pipeline{
		// Stage 1: 過濾價格 > 500
		{{"$match", bson.D{{"price", bson.D{{"$gt", 500}}}}}},

		// Stage 2: 依分類分組計算總營收與平均單價
		{{"$group", bson.D{
			{"_id", "$category"},
			{"totalRevenue", bson.D{{"$sum", "$price"}}},
			{"avgPrice", bson.D{{"$avg", "$price"}}},
			{"count", bson.D{{"$sum", 1}}},
		}}},

		// Stage 3: 依總額降冪排序
		{{"$sort", bson.D{{"totalRevenue", -1}}}},
	}

	cursor, err := col.Aggregate(ctx, pipeline)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	var stats []bson.M
	if err := cursor.All(ctx, &stats); err != nil {
		return err
	}

	for _, s := range stats {
		fmt.Printf("分類: %v, 總額: %v, 件數: %v\n", s["_id"], s["totalRevenue"], s["count"])
	}
	return nil
}
```

---

## 7. 多文件交易 (ACID Transactions in Go)

使用 `session.WithTransaction` 提供安全、自動處理認可與錯誤復原（Rollback）的交易機制：

```go
func TransferCredits(ctx context.Context, client *mongo.Client, fromID, toID primitive.ObjectID, amount float64) error {
	session, err := client.StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)

	// 定義交易內部邏輯
	callback := func(sessCtx mongo.SessionContext) (interface{}, error) {
		usersCol := client.Database("bank_db").Collection("users")

		// 1. 扣款
		deductRes, err := usersCol.UpdateOne(
			sessCtx,
			bson.M{"_id": fromID, "balance": bson.M{"$gte": amount}},
			bson.M{"$inc": bson.M{"balance": -amount}},
		)
		if err != nil || deductRes.ModifiedCount == 0 {
			return nil, fmt.Errorf("扣款失敗或餘額不足")
		}

		// 2. 入帳
		_, err = usersCol.UpdateOne(
			sessCtx,
			bson.M{"_id": toID},
			bson.M{"$inc": bson.M{"balance": amount}},
		)
		if err != nil {
			return nil, err
		}

		return nil, nil
	}

	_, err = session.WithTransaction(ctx, callback)
	return err
}
```
