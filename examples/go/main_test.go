package main

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestTransferIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, err := connect(ctx, envOr("MONGO_TX_URI", "mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect(context.Background())
	users := client.Database(dbName).Collection("go_transfer_checks")
	sender, recipient, missing := bson.NewObjectID(), bson.NewObjectID(), bson.NewObjectID()
	cleanup := bson.M{"_id": bson.M{"$in": bson.A{sender, recipient}}}
	defer users.DeleteMany(context.Background(), cleanup)
	readBalances := func() []int64 {
		values := []int64{}
		for _, id := range []bson.ObjectID{sender, recipient} {
			var user struct {
				Balance int64 `bson:"balance"`
			}
			if err := users.FindOne(ctx, bson.M{"_id": id}).Decode(&user); err != nil {
				t.Fatal(err)
			}
			values = append(values, user.Balance)
		}
		return values
	}
	cases := []struct {
		name     string
		from, to bson.ObjectID
		amount   int64
		ok       bool
	}{
		{"success", sender, recipient, 2500, true},
		{"insufficient", sender, recipient, 10001, false},
		{"sender missing", missing, recipient, 100, false},
		{"recipient missing", sender, missing, 100, false},
		{"zero", sender, recipient, 0, false},
		{"negative", sender, recipient, -100, false},
		{"same account", sender, sender, 100, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := users.DeleteMany(ctx, cleanup); err != nil {
				t.Fatal(err)
			}
			if _, err := users.InsertMany(ctx, []any{
				bson.M{"_id": sender, "balance": int64(10000)},
				bson.M{"_id": recipient, "balance": int64(5000)},
			}); err != nil {
				t.Fatal(err)
			}
			err := transfer(ctx, client, users, tc.from, tc.to, tc.amount)
			expected := []int64{10000, 5000}
			if tc.ok {
				if err != nil {
					t.Fatal(err)
				}
				expected = []int64{7500, 7500}
			} else if !errors.Is(err, errTransferRejected) {
				t.Fatalf("expected rejection, got %v", err)
			}
			if actual := readBalances(); !reflect.DeepEqual(actual, expected) {
				t.Fatalf("balances %v, expected %v", actual, expected)
			}
		})
	}
}
