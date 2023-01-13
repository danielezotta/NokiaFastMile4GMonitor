const express = require("express");
const path = require("path");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync")
const fastmile = require("./fastmile4g.js");


const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ ip: "", millis: 120000, signals: [], changes: [] }).write();

var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = 3333;

app.get("/now", (req, res) => {
  fastmile.now(db.get("ip"), res);
})

app.post("/ip", (req, res) => {
  db.set("ip", req.body.ip).write();
  res.json({ "ip": req.body.ip });
})

app.get("/ip", (req, res) => {
  res.json({ "ip": db.get("ip") });
})

app.get("/history", (req, res) => {
  res.json({ "signals": db.get("signals").orderBy("time", "desc").slice(0, 15) });
})

app.get("/changes", (req, res) => {
  res.json({ "changes": db.get("changes").orderBy("time", "desc").slice(0, 10) });
})

app.use('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/express/index.html'));
})

app.listen(PORT, () => {
  console.log("Listening on port " + PORT);
  fastmile.timer(db.get("ip"), db);
})