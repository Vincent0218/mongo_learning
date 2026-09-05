// Explicit destructive exercise command; never infer a database from the URI.
db = db.getSiblingDB("mongo_learning_lab");
print("Removing only mongo_learning_lab; restore fixtures by running seed.js.");
db.dropDatabase();
