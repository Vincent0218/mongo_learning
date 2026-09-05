const check = require("node:assert/strict");
// Dedicated collection; rebuilding this exercise does not affect products/orders.
db = db.getSiblingDB("mongo_learning_lab");
db.index_lab.drop();
db.index_lab.insertMany(Array.from({length: 10000}, (_, i) => ({_id: i, status: i % 10 === 0 ? "PAID" : "PENDING", createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000), totalAmount: i * 100})));
const query = {status: "PAID", totalAmount: {$gte: 500000}};
const sort = {createdAt: -1, _id: -1};
const before = db.index_lab.find(query).sort(sort).limit(10).explain("executionStats");
db.index_lab.createIndex({status: 1, createdAt: -1, _id: -1, totalAmount: 1}, {name: "ranking_esr"});
const after = db.index_lab.find(query).sort(sort).limit(10).hint("ranking_esr").explain("executionStats");
check.deepEqual(before.executionStats.nReturned, 10);
check.deepEqual(after.executionStats.nReturned, 10);
check(after.executionStats.totalDocsExamined < before.executionStats.totalDocsExamined);
printjson({before: before.executionStats, after: after.executionStats});
// hint isolates this experiment. Compare the unhinted plan for real workloads.
