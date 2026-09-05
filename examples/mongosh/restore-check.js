const check = require("node:assert/strict");
const original = db.getSiblingDB("mongo_learning_lab");
const restored = db.getSiblingDB("mongo_learning_restore_check");
const names = original.getCollectionNames().sort();
check(names.includes("products"));
check.equal(JSON.stringify(restored.getCollectionNames().sort()), JSON.stringify(names));
for (const name of names) {
  check.equal(EJSON.stringify(restored.getCollection(name).find().sort({_id: 1}).toArray()),
    EJSON.stringify(original.getCollection(name).find().sort({_id: 1}).toArray()), name + " documents");
  const normalize = indexes => indexes.map(({ns, ...index}) => index).sort((a, b) => a.name.localeCompare(b.name));
  check.equal(EJSON.stringify(normalize(restored.getCollection(name).getIndexes())),
    EJSON.stringify(normalize(original.getCollection(name).getIndexes())), name + " indexes");
}
print("Restore checks passed");
