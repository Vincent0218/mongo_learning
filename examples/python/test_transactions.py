"""Integration tests against the local replica set, not mocks."""
import unittest
from bson import ObjectId
from bson.int64 import Int64
from pydantic import ValidationError
from pymongo import MongoClient
from demo import DB_NAME, TX_URI, ProductModel, TransferRejected, transfer


class TransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = MongoClient(TX_URI, serverSelectionTimeoutMS=5000)
        hello = cls.client.admin.command("hello")
        if hello.get("setName") != "rs0":
            raise RuntimeError("Start compose.transactions.yml and wait for rs0 primary")
        cls.users = cls.client[DB_NAME]["python_transfer_checks"]

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

    def setUp(self):
        self.sender, self.recipient, self.missing = ObjectId(), ObjectId(), ObjectId()
        self.users.insert_many([
            {"_id": self.sender, "balance": Int64(10000)},
            {"_id": self.recipient, "balance": Int64(5000)},
        ])

    def tearDown(self):
        self.users.delete_many({"_id": {"$in": [self.sender, self.recipient]}})

    def balances(self):
        return [self.users.find_one({"_id": id})["balance"] for id in [self.sender, self.recipient]]

    def test_success_conserves_total(self):
        transfer(self.client, self.users, self.sender, self.recipient, 2500)
        self.assertEqual(self.balances(), [7500, 7500])

    def test_failures_leave_both_balances_unchanged(self):
        for sender, recipient, amount in [
            (self.sender, self.recipient, 10001),
            (self.missing, self.recipient, 100),
            (self.sender, self.missing, 100),
            (self.sender, self.recipient, 0),
            (self.sender, self.recipient, -100),
            (self.sender, self.sender, 100),
        ]:
            with self.subTest(sender=sender, recipient=recipient, amount=amount):
                with self.assertRaises(TransferRejected):
                    transfer(self.client, self.users, sender, recipient, amount)
                self.assertEqual(self.balances(), [10000, 5000])


class ModelTests(unittest.TestCase):
    def test_roundtrip_filter_and_invalid_id(self):
        id = ObjectId()
        model = ProductModel.model_validate({"_id": id, "name": "耳機", "price": 100, "stock": 1})
        self.assertEqual(ObjectId(model.id), id)
        with self.assertRaises(ValidationError):
            ProductModel.model_validate({"_id": "invalid", "name": "耳機", "price": 100, "stock": 1})


if __name__ == "__main__":
    unittest.main()
