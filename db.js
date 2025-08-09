// db.js
const { MongoClient } = require("mongodb");
require("dotenv").config();

// Aus .env laden – vorher sicherstellen, dass MONGODB_URI gesetzt ist:
// MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/deineDB?retryWrites=true&w=majority
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Bitte MONGODB_URI in der .env definieren!");

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

let _db;
module.exports = {
  connect: async () => {
    if (_db) return _db;
    await client.connect();
    _db = client.db();        // Default-DB aus der URI
    return _db;
  }
};
