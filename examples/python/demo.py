"""Run from the repository root: uv run --project examples/python examples/python/demo.py."""
import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, Field
from pymongo import AsyncMongoClient, MongoClient
from pymongo.read_concern import ReadConcern
from pymongo.read_preferences import ReadPreference
from pymongo.write_concern import WriteConcern

URI = os.getenv("MONGO_URI", "mongodb://admin:password123@127.0.0.1:27017/?authSource=admin")
TX_URI = os.getenv("MONGO_TX_URI", "mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true")
DB_NAME = "mongo_learning_lab"


def id_as_string(value):
    if isinstance(value, ObjectId):
        return str(value)
    if not isinstance(value, str) or not ObjectId.is_valid(value):
        raise ValueError("Expected a 24-character ObjectId")
    return value


# API output representation only; convert explicitly to ObjectId for database filters.
ApiObjectId = Annotated[str, BeforeValidator(id_as_string)]


class ProductModel(BaseModel):
    id: ApiObjectId = Field(alias="_id")
    name: str
    price: int = Field(ge=0)  # TWD cents
    stock: int = Field(ge=0)


class TransferRejected(ValueError):
    pass


def transfer(client, users, from_id: ObjectId, to_id: ObjectId, amount: int):
    if type(amount) is not int or amount <= 0 or amount > 2**63 - 1:
        raise TransferRejected("Amount must be a positive int64 in TWD cents")
    if from_id == to_id:
        raise TransferRejected("Sender and recipient must differ")

    def callback(session):
        debit = users.update_one(
            {"_id": from_id, "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount}}, session=session,
        )
        if debit.matched_count != 1:
            raise TransferRejected("Sender missing or insufficient balance")
        credit = users.update_one(
            {"_id": to_id}, {"$inc": {"balance": amount}}, session=session,
        )
        if credit.matched_count != 1:
            raise TransferRejected("Recipient missing")
        # No email, HTTP calls or other external side effects here: callback may retry.

    with client.start_session() as session:
        session.with_transaction(
            callback, read_concern=ReadConcern("snapshot"),
            write_concern=WriteConcern("majority"), read_preference=ReadPreference.PRIMARY,
        )


def sync_demo():
    with MongoClient(URI, serverSelectionTimeoutMS=5000) as client:
        client.admin.command("ping")
        collection = client[DB_NAME]["products"]
        doc = collection.find_one({"_id": ObjectId("100000000000000000000001")})
        if doc is None:
            raise RuntimeError("Run examples/mongosh/seed.js first")
        model = ProductModel.model_validate(doc)
        print(model.model_dump_json(by_alias=True))
        print("ObjectId filter:", {"_id": ObjectId(model.id)})
        scratch = client[DB_NAME]["python_crud"]
        inserted = scratch.insert_one({"name": "A+B.耳機", "price": 100, "stock": 1, "createdAt": datetime.now(timezone.utc)})
        try:
            query = {"_id": inserted.inserted_id, "stock": {"$gte": 1}}
            assert scratch.update_one(query, {"$inc": {"stock": -1}}).matched_count == 1
            assert scratch.update_one(query, {"$inc": {"stock": -1}}).matched_count == 0
            pattern = re.compile(re.escape("A+B."), re.IGNORECASE)
            assert scratch.count_documents({"_id": inserted.inserted_id, "name": pattern}) == 1
            print("Python CRUD / literal regex passed")
        finally:
            scratch.delete_one({"_id": inserted.inserted_id})


async def async_demo():
    async with AsyncMongoClient(URI, serverSelectionTimeoutMS=5000) as client:
        await client.admin.command("ping")
        cursor = client[DB_NAME]["products"].find({"price": {"$gte": 100000}}).sort([("price", -1), ("_id", 1)]).limit(5)
        async for item in cursor:
            print(item["name"], item["price"] / 100)


if __name__ == "__main__":
    sync_demo()
    asyncio.run(async_demo())
