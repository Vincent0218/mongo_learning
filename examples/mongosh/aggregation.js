const check = require("node:assert/strict");
db = db.getSiblingDB("mongo_learning_lab");
const monthlyRanking = [
  {$match: {status: "PAID", createdAt: {$gte: ISODate("2026-01-01T00:00:00Z"), $lt: ISODate("2026-02-01T00:00:00Z")}}},
  {$unwind: "$items"},
  {$group: {_id: "$items.productId", totalQuantitySold: {$sum: "$items.qty"}, totalRevenue: {$sum: {$multiply: ["$items.qty", "$items.unitPrice"]}}}},
  {$sort: {totalRevenue: -1, _id: 1}},
  {$limit: 5},
  {$project: {_id: 0, productId: "$_id", totalQuantitySold: 1, totalRevenue: 1}}
];
const ranking = db.orders.aggregate(monthlyRanking).toArray();
// mongosh cursor arrays can originate in a different VM realm; compare JSON values.
check.equal(JSON.stringify(ranking.map(row => Number(row.totalRevenue))), JSON.stringify([1497000, 990000, 320000]));
check.equal(JSON.stringify(ranking.map(row => Number(row.totalQuantitySold))), JSON.stringify([3, 1, 1]));
printjson(ranking);
