const databases = db.adminCommand({listDatabases: 1, nameOnly: true}).databases;
if (databases.some(item => item.name === "mongo_learning_restore_check")) {
  throw new Error("Restore target already exists; inspect it before proceeding");
}
print("Restore target absent; safe to create mongo_learning_restore_check");
