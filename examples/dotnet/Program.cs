using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using MongoDB.Driver.Linq;

const string dbName = "mongo_learning_lab";
var checks = args.Contains("--check");
var uri = Environment.GetEnvironmentVariable(checks ? "MONGO_TX_URI" : "MONGO_URI")
    ?? (checks ? "mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"
               : "mongodb://admin:password123@127.0.0.1:27017/?authSource=admin");
var settings = MongoClientSettings.FromConnectionString(uri);
settings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
var client = new MongoClient(settings);
var database = client.GetDatabase(dbName);
using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
var ct = timeout.Token;
await database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: ct);
if (checks)
{
    await CheckTransactionsAsync(client, database.GetCollection<Account>("dotnet_transfer_checks"), ct);
}
else
{
    var products = database.GetCollection<Product>("products");
    var rows = await products.AsQueryable().Where(p => p.Price >= 100000)
        .OrderByDescending(p => p.Price).ThenBy(p => p.Id).Take(5).ToListAsync(ct);
    if (rows.Count == 0) throw new InvalidOperationException("Run seed.js first");
    foreach (var product in rows) Console.WriteLine($"{product.Name}: {product.Price / 100m}");
    var scratch = database.GetCollection<Product>("dotnet_crud");
    var item = new Product { Id = ObjectId.GenerateNewId(), Name = "A+B.耳機", Price = 100, Stock = 1 };
    await scratch.InsertOneAsync(item, cancellationToken: ct);
    try
    {
        var filter = Builders<Product>.Filter.Eq(p => p.Id, item.Id) & Builders<Product>.Filter.Gte(p => p.Stock, 1);
        foreach (var expected in new long[] { 1, 0 })
        {
            var result = await scratch.UpdateOneAsync(filter, Builders<Product>.Update.Inc(p => p.Stock, -1), cancellationToken: ct);
            if (result.MatchedCount != expected) throw new Exception("Stock check failed");
        }
        var literal = Builders<Product>.Filter.Eq(p => p.Id, item.Id) &
            Builders<Product>.Filter.Regex(p => p.Name, new BsonRegularExpression(Regex.Escape("A+B."), "i"));
        if (await scratch.CountDocumentsAsync(literal, cancellationToken: ct) != 1) throw new Exception("Literal regex check failed");
        Console.WriteLine("C# CRUD / literal regex passed");
    }
    finally { await scratch.DeleteOneAsync(p => p.Id == item.Id); }
}

static async Task CheckTransactionsAsync(IMongoClient client, IMongoCollection<Account> users, CancellationToken ct)
{
    var sender = ObjectId.GenerateNewId();
    var recipient = ObjectId.GenerateNewId();
    var missing = ObjectId.GenerateNewId();
    var owned = Builders<Account>.Filter.In(u => u.Id, new[] { sender, recipient });
    var cases = new (string Name, ObjectId From, ObjectId To, long Amount, bool Success)[] {
        ("success", sender, recipient, 2500, true),
        ("insufficient", sender, recipient, 10001, false),
        ("sender missing", missing, recipient, 100, false),
        ("recipient missing", sender, missing, 100, false),
        ("zero", sender, recipient, 0, false),
        ("negative", sender, recipient, -100, false),
        ("same account", sender, sender, 100, false)
    };
    try
    {
        foreach (var test in cases)
        {
            await users.DeleteManyAsync(owned, ct);
            await users.InsertManyAsync(new[] {
                new Account { Id = sender, Balance = 10000 },
                new Account { Id = recipient, Balance = 5000 }
            }, cancellationToken: ct);
            var rejected = false;
            try { await Transfers.TransferAsync(client, users, test.From, test.To, test.Amount, ct); }
            catch (TransferRejectedException) { rejected = true; }
            if (rejected == test.Success) throw new Exception($"Unexpected outcome: {test.Name}");
            var from = await users.Find(u => u.Id == sender).SingleAsync(ct);
            var to = await users.Find(u => u.Id == recipient).SingleAsync(ct);
            if (from.Balance != (test.Success ? 7500 : 10000) || to.Balance != (test.Success ? 7500 : 5000))
                throw new Exception($"Balance invariant failed: {test.Name}");
            Console.WriteLine($"PASS: {test.Name}");
        }
    }
    finally { await users.DeleteManyAsync(owned); }
}

public static class Transfers
{
    public static async Task TransferAsync(IMongoClient client, IMongoCollection<Account> users,
        ObjectId fromId, ObjectId toId, long amount, CancellationToken ct = default)
    {
        if (amount <= 0 || fromId == toId) throw new TransferRejectedException("Invalid amount or same account");
        using var session = await client.StartSessionAsync(cancellationToken: ct);
        await session.WithTransactionAsync(async (s, token) =>
        {
            var debit = await users.UpdateOneAsync(s,
                Builders<Account>.Filter.Eq(u => u.Id, fromId) & Builders<Account>.Filter.Gte(u => u.Balance, amount),
                Builders<Account>.Update.Inc(u => u.Balance, -amount), cancellationToken: token);
            if (debit.MatchedCount != 1) throw new TransferRejectedException("Sender missing or insufficient balance");
            var credit = await users.UpdateOneAsync(s, Builders<Account>.Filter.Eq(u => u.Id, toId),
                Builders<Account>.Update.Inc(u => u.Balance, amount), cancellationToken: token);
            if (credit.MatchedCount != 1) throw new TransferRejectedException("Recipient missing");
            return true;
        }, new TransactionOptions(readConcern: ReadConcern.Snapshot,
            readPreference: ReadPreference.Primary, writeConcern: WriteConcern.WMajority), ct);
    }
}

public sealed class TransferRejectedException(string message) : Exception(message);

[BsonIgnoreExtraElements]
public class Product
{
    [BsonId] public ObjectId Id { get; set; }
    [BsonElement("name")] public string Name { get; set; } = "";
    [BsonElement("price")] public long Price { get; set; } // TWD cents
    [BsonElement("stock")] public int Stock { get; set; }
    [BsonElement("createdAt"), BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
public class Account
{
    [BsonId] public ObjectId Id { get; set; }
    [BsonElement("balance")] public long Balance { get; set; }
}
