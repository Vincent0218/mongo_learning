const check = require("node:assert/strict");
db = db.getSiblingDB("mongo_learning_lab");
const ids = [1,2,3,4].map(n => ObjectId("10000000000000000000000" + n));
check.deepEqual(db.products.countDocuments({_id: {$in: ids}, discount: null}), 4);
check.deepEqual(db.products.countDocuments({_id: {$in: ids}, discount: {$type: 10}}), 1);
check.deepEqual(db.products.countDocuments({_id: {$in: ids}, discount: {$exists: false}}), 3);
const id = ObjectId("400000000000000000000001");
try {
  db.crud_checks.replaceOne({_id: id}, {_id: id, name: "A+B.耳機", stock: 1}, {upsert: true});
  const filter = {_id: id, stock: {$gte: 1}};
  check.deepEqual(db.crud_checks.updateOne(filter, {$inc: {stock: -1}}).matchedCount, 1);
  check.deepEqual(db.crud_checks.updateOne(filter, {$inc: {stock: -1}}).matchedCount, 0);
  check.deepEqual(db.crud_checks.findOne({_id: id}).stock, 0);
  check.deepEqual(db.crud_checks.countDocuments({name: {$regex: "A\\+B\\."}}), 1);
  check.deepEqual(db.crud_checks.deleteOne({_id: id}).deletedCount, 1);
  print("CRUD checks passed");
} finally {
  db.crud_checks.deleteOne({_id: id});
}
