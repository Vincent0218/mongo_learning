// Run only against a Search-enabled tutorial deployment after indexes are queryable.
const check = require("node:assert/strict");
db = db.getSiblingDB("mongo_learning_lab");
const ear = ObjectId("100000000000000000000001").toString();
const exact = db.products.aggregate([
  {$search: {index: "products_search", equals: {path: "sku", value: "SKU-001"}}}
]).toArray();
check.equal(JSON.stringify(exact.map(x => x._id.toString())), JSON.stringify([ear]));
const autocomplete = db.products.aggregate([
  {$search: {index: "products_search", autocomplete: {path: "name", query: "降噪"}}},
  {$limit: 5}
]).toArray();
check(autocomplete.some(x => x._id.toString() === ear));
const category = db.products.aggregate([
  {$search: {index: "products_search", compound: {filter: [{equals: {path: "category", value: "周邊配備"}}]}}},
  {$sort: {_id: 1}}
]).toArray();
check.equal(JSON.stringify(category.map(x => x.sku)), JSON.stringify(["SKU-002", "SKU-003"]));
const substring = db.products.aggregate([
  {$search: {index: "products_substring", wildcard: {path: "name", query: "*降噪*", allowAnalyzedField: true}}}
]).toArray();
check(substring.some(x => x._id.toString() === ear));
const vectors = db.products.aggregate([
  {$vectorSearch: {index: "products_vector", path: "embedding", queryVector: [1, 0, 0], numCandidates: 100, limit: 2}},
  {$project: {name: 1, score: {$meta: "vectorSearchScore"}}}
]).toArray();
check.equal(vectors.length, 2);
check.equal(vectors[0]._id.toString(), ear);
printjson(vectors);
print("Search checks passed");
