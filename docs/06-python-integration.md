# Level 6：Python 實戰整合 (Python + MongoDB)

在現代 Python 專案開發中，乾淨的虛擬環境隔離、非同步支援與嚴格的資料型別驗證是不可或缺的三大關鍵。本章將以現代工具鏈展示如何以高水準架構整合 MongoDB。

---

## 1. 專案環境初始化：嚴格使用 `uv`

我們全程使用 `uv` 來管理 Python 專案與依賴，避免弄髒系統的全域環境：

```bash
# 1. 在專案目錄下初始化 (若尚未初始化)
uv init

# 2. 安裝 MongoDB 核心套件與型別驗證庫
uv add pymongo motor pydantic
```

- **`pymongo`**：MongoDB 官方標準同步 Driver。
- **`motor`**：基於 asyncio 的官方非同步 Driver（非常適合 FastAPI / Tornado / Aiohttp）。
- **`pydantic`**：資料型別驗證與序列化工具。

---

## 2. 處理 BSON ObjectId 與 Pydantic 型別轉換

MongoDB 的 `_id` 是 `ObjectId`，但 API 回應通常需要序列化為字串。以下是現代 Pydantic v2 的最佳處理慣例：

```python
from typing import Annotated
from bson import ObjectId
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict

# 自定義型別：將 ObjectId 雙向轉換為字串
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]

class ProductModel(BaseModel):
    id: PyObjectId | None = Field(default=None, alias="_id")
    name: str
    price: float
    tags: list[str] = Field(default_factory=list)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str}
    )
```

---

## 3. 同步開發：PyMongo 實戰範例

以下範例示範如何建立連線、安全讀寫與資料轉換：

```python
# sync_demo.py
from pymongo import MongoClient
from datetime import datetime

MONGO_URI = "mongodb://admin:password123@localhost:27017/?authSource=admin"

def main():
    # 建立客戶端 (自動維護連線池 Connection Pool)
    with MongoClient(MONGO_URI) as client:
        db = client["store_db"]
        collection = db["products"]

        # 1. 寫入資料
        new_item = {
            "name": "機械鍵盤 G913",
            "category": "周邊配備",
            "price": 6290,
            "stock": 15,
            "created_at": datetime.utcnow()
        }
        res = collection.insert_one(new_item)
        print(f"✅ 成功插入文件，ID: {res.inserted_id}")

        # 2. 查詢資料
        product = collection.find_one({"name": "機械鍵盤 G913"})
        print("🔍 查詢結果：", product)

        # 3. 原子更新庫存
        update_res = collection.update_one(
            {"_id": res.inserted_id},
            {"$inc": {"stock": -1}}
        )
        print(f"🔄 更新影響筆數: {update_res.modified_count}")

if __name__ == "__main__":
    main()
```

執行方式（透過 `uv` 執行，自動使用虛擬環境）：
```bash
uv run python sync_demo.py
```

---

## 4. 多文件交易 (ACID Transactions)

當需要同時修改多個集合且必須保證「要嘛全成功、要嘛全失敗」時（例如：扣除帳戶餘額並建立訂單記錄），可以使用 Client Session 交易機制：

```python
def transfer_credits(client: MongoClient, from_user_id, to_user_id, amount: int):
    # 交易需要副本集 (Replica Set) 環境支援
    with client.start_session() as session:
        with session.start_transaction():
            users = client["app_db"]["users"]
            
            # 1. 扣除餘額
            users.update_one(
                {"_id": from_user_id, "balance": {"$gte": amount}},
                {"$inc": {"balance": -amount}},
                session=session
            )
            # 2. 增加餘額
            users.update_one(
                {"_id": to_user_id},
                {"$inc": {"balance": amount}},
                session=session
            )
            # 若任一步驟拋出例外，將自動復原 (Rollback)
```

---

## 5. 非同步開發：Motor + FastAPI 整合範例

在現代高效能 Web API 中，使用非同步 Driver 能大幅提升 I/O 併發吞吐量：

```python
# async_demo.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://admin:password123@localhost:27017/?authSource=admin"

async def fetch_top_products():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client["store_db"]
    collection = db["products"]

    cursor = collection.find({"price": {"$gt": 1000}}).sort("price", -1).limit(5)
    results = await cursor.to_list(length=5)

    for item in results:
        print(f"📦 {item['name']} - NT$ {item['price']}")

    client.close()

if __name__ == "__main__":
    asyncio.run(fetch_top_products())
```

執行：
```bash
uv run python async_demo.py
```
