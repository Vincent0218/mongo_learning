// Only touches the fixed tutorial namespace and fixed fixture IDs.
// Rerunning restores fixtures; unrelated documents are not deleted.
db = db.getSiblingDB("mongo_learning_lab");
const productId = n => ObjectId("10000000000000000000000" + n);
const userId = n => ObjectId("20000000000000000000000" + n);
const products = [
  {n: 1, name: "無線降噪耳機", category: "電子產品", price: 499000, stock: 45, tags: ["藍牙", "降噪"], embedding: [1, 0, 0]},
  {n: 2, name: "人體工學鍵盤", category: "周邊配備", price: 320000, stock: 12, tags: ["辦公"], embedding: [0, 1, 0]},
  {n: 3, name: "4K 27吋螢幕", category: "周邊配備", price: 990000, stock: 8, tags: ["辦公"], embedding: [0, 0, 1]},
  {n: 4, name: "USB-C 充電器", category: "配件", price: 89000, stock: 120, tags: ["充電"], embedding: [0.1, 0.7, 0.7]}
];
for (const {n, ...product} of products) {
  db.products.replaceOne({_id: productId(n)}, {
    _id: productId(n), ...product, sku: "SKU-00" + n,
    description: product.name + "，適合日常使用", createdAt: ISODate("2026-01-01T00:00:00Z"),
    ...(n === 1 ? {specs: {weight: 250, batteryHours: 30}, discount: null} : {})
  }, {upsert: true});
}
for (const [n, name, balance] of [[1, "Alice", 100000], [2, "Bob", 50000]]) {
  db.users.replaceOne({_id: userId(n)}, {_id: userId(n), name, balance: NumberLong(String(balance))}, {upsert: true});
}
const orders = [
  [1, "PAID", "2026-01-10", [[1, 2], [2, 1]]],
  [2, "PAID", "2026-01-20", [[1, 1], [3, 1]]],
  [3, "CANCELLED", "2026-01-21", [[3, 10]]],
  [4, "PAID", "2026-02-01", [[3, 10]]]
];
for (const [n, status, date, lines] of orders) {
  const items = lines.map(([p, qty]) => ({productId: productId(p), name: products[p-1].name, qty, unitPrice: products[p-1].price}));
  const _id = ObjectId("30000000000000000000000" + n);
  db.orders.replaceOne({_id}, {_id, userId: userId(1), status, createdAt: ISODate(date + "T00:00:00Z"), items,
    totalAmount: items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)}, {upsert: true});
}
print("Fixtures ready: products=4, users=2, orders=4 (fixed IDs; amounts in TWD cents)");
