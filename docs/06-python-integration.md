# Level 6：Python 實戰整合

**前置條件：** 完成[一般環境與交易環境](lab.md)初始化。版本固定為 Python 3.12 以上、PyMongo 4.15.5、Pydantic 2.12.5；詳細相依版本在 `examples/python/uv.lock`。

## 1. 執行完整範例

從專案根目錄執行，不需要再次 uv init，也不會把 Driver 加入網站的依賴：

```powershell
uv run --project examples/python examples/python/demo.py
uv run --project examples/python python -m unittest discover -s examples/python -v
```

第一個命令顯示耳機 JSON、CRUD/regex 檢查結果，並以非同步讀取螢幕、耳機、鍵盤。金額 JSON 保留「分」，顯示時才換算為元。第二個命令驗證模型轉換與交易成功／失敗情境。

## 2. ObjectId、Pydantic 與金額

API 輸出的 ID 是字串；資料庫 filter 需要明確 `ObjectId(model.id)`。BeforeValidator 把 BSON ObjectId 轉成經驗證的字串，不會自動雙向轉換。範例也拒絕格式不合法的字串。

price 使用整數分，避免用 binary float 累計金額。其他需要小數精度的系統可選 Decimal128，但要定義 Python Decimal 與 BSON 的轉換，不可只換型別名稱。

## 3. 同步 CRUD 與非同步讀取

以下直接引用可執行檔，包含完整 imports、入口與交易函式：

```python
--8<-- "examples/python/demo.py"
```

MongoClient 共用連線池；長生命週期服務應在應用程式啟停時建立／關閉，而不是每個請求建立 client。AsyncMongoClient 應在同一 event loop 使用；find 回傳 cursor，不需要 await，真正取得結果或關閉非同步資源才需要 await。

本章使用 PyMongo Async。Motor 已棄用，新教學不再以 Motor 為主線；遷移時仍需測試工作負載，不能保證非同步一定比同步快。[官方遷移指南](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)

## 4. 交易的業務條件

transfer 依序檢查：

1. 金額為正整數且在 int64 範圍，兩端帳戶不同。
2. 扣款命中一筆，包含 balance 足夠的條件。
3. 入帳命中一筆，否則拋出 TransferRejected，使扣款回滾。

所有操作都帶同一 session。with_transaction 處理符合條件的重試；callback 可能執行多次，不能在其中寄信或呼叫有副作用的外部 API。保留資料庫例外，讓 Driver 能辨識 retry labels。整個業務請求若重送，仍需另設業務冪等鍵，不能只依靠 transaction。

範例的金額模型假設帳戶餘額與加總在 int64 可表示範圍內。正式金流還需明確處理上限、授權及冪等性；本章只示範交易一致性。

## 練習與解答

**練習：** 收款人不存在時 update_one 沒有丟例外，為何仍要自己 raise？

??? success "解答"
    未命中不是資料庫操作錯誤，transaction 不會自動知道業務失敗。不檢查 matched_count 就會提交先前的扣款。測試包含這個情境，並確認兩端餘額保持不變。

參考：[PyMongo transactions](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/crud/transactions/)。
