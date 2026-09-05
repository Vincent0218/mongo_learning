package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const dbName = "mongo_learning_lab"

var errTransferRejected = errors.New("transfer rejected")

type Product struct {
	ID        bson.ObjectID `bson:"_id,omitempty"`
	Name      string        `bson:"name"`
	Price     int64         `bson:"price"` // TWD cents
	Stock     int           `bson:"stock"`
	CreatedAt time.Time     `bson:"createdAt"`
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func connect(ctx context.Context, uri string) (*mongo.Client, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second))
	if err != nil {
		return nil, err
	}
	if err = client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}
	return client, nil
}

func transfer(ctx context.Context, client *mongo.Client, users *mongo.Collection, fromID, toID bson.ObjectID, amount int64) error {
	if amount <= 0 || fromID == toID {
		return errTransferRejected
	}
	session, err := client.StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(context.Background())
	_, err = session.WithTransaction(ctx, func(txCtx context.Context) (any, error) {
		debit, err := users.UpdateOne(txCtx,
			bson.M{"_id": fromID, "balance": bson.M{"$gte": amount}},
			bson.M{"$inc": bson.M{"balance": -amount}})
		if err != nil {
			return nil, err
		} // Keep error labels used by driver retries.
		if debit.MatchedCount != 1 {
			return nil, errTransferRejected
		}
		credit, err := users.UpdateOne(txCtx, bson.M{"_id": toID}, bson.M{"$inc": bson.M{"balance": amount}})
		if err != nil {
			return nil, err
		}
		if credit.MatchedCount != 1 {
			return nil, errTransferRejected
		}
		return nil, nil
	}, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()).SetReadPreference(readpref.Primary()))
	return err
}

func run(ctx context.Context) error {
	client, err := connect(ctx, envOr("MONGO_URI", "mongodb://admin:password123@127.0.0.1:27017/?authSource=admin"))
	if err != nil {
		return err
	}
	defer client.Disconnect(context.Background())
	products := client.Database(dbName).Collection("products")
	cursor, err := products.Find(ctx, bson.M{"price": bson.M{"$gte": 100000}},
		options.Find().SetSort(bson.D{{Key: "price", Value: -1}, {Key: "_id", Value: 1}}).SetLimit(5))
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	var results []Product
	if err = cursor.All(ctx, &results); err != nil {
		return err
	}
	if len(results) == 0 {
		return fmt.Errorf("run seed.js first")
	}
	fmt.Println(results)
	scratch := client.Database(dbName).Collection("go_crud")
	id := bson.NewObjectID()
	_, err = scratch.InsertOne(ctx, Product{ID: id, Name: "A+B.耳機", Price: 100, Stock: 1, CreatedAt: time.Now().UTC()})
	if err != nil {
		return err
	}
	defer scratch.DeleteOne(context.Background(), bson.M{"_id": id})
	for _, expected := range []int64{1, 0} {
		result, err := scratch.UpdateOne(ctx, bson.M{"_id": id, "stock": bson.M{"$gte": 1}}, bson.M{"$inc": bson.M{"stock": -1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != expected {
			return fmt.Errorf("stock check failed")
		}
	}
	count, err := scratch.CountDocuments(ctx, bson.M{"_id": id, "name": bson.Regex{Pattern: regexp.QuoteMeta("A+B."), Options: "i"}})
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("literal regex check failed")
	}
	fmt.Println("Go CRUD / literal regex passed")
	return nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
