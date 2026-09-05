// Run by compose.transactions.yml; safe to rerun on the same replica set.
try {
  rs.status();
} catch (error) {
  if (error.code !== 94) throw error; // NotYetInitialized
  const result = rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongodb:27017"}]});
  if (!result.ok) throw new Error(JSON.stringify(result));
}
let writable = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) { writable = true; break; }
  sleep(1000);
}
if (!writable) throw new Error("Replica set did not elect a primary within 60 seconds");
print("rs0 primary ready");
