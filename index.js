const express = require("express");
const path = require("path");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync")
const fastmile = require("./fastmile4g.js");

const PORT = 3333;
const DEFAULT_MILLIS_DELAY = 120000;
const DEFAULT_NIGHT_MODE_MILLIS_DELAY = 600000;
const DEFAULT_NIGHT_MODE_START_HOUR = 23;
const DEFAULT_NIGHT_MODE_END_HOUR = 7;
const DEFAULT_NIGHT_MODE_ENABLED = false;
const DEFAULT_CHANGES_GET_LIMIT = 30;
const DEFAULT_HISTORY_GET_LIMIT = 15;
const DEFAULT_SPEEDTEST_MILLIS_DELAY = 10800000;

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ 
  ip: "", 
  millis: DEFAULT_MILLIS_DELAY, 
  signals: [], 
  changes: [], 
  night: { 
    enabled: DEFAULT_NIGHT_MODE_ENABLED, 
    start: DEFAULT_NIGHT_MODE_START_HOUR, 
    end: DEFAULT_NIGHT_MODE_END_HOUR, 
    millis: DEFAULT_NIGHT_MODE_MILLIS_DELAY 
  },
  speedtest: {
    millis: DEFAULT_SPEEDTEST_MILLIS_DELAY,
    list: [],
  }
}).write();

var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

app.get("/now", (req, res) => {
  fastmile.now(db.get("ip"), db, (signal) => {
    res.send({
      "primary" : signal.primary, 
      "secondary" : signal.secondary 
    });
  });
});

app.post("/ip", (req, res) => {
  db.set("ip", req.body.ip).write();
  res.json({ "ip": req.body.ip });
});

app.get("/ip", (req, res) => {
  res.json({ "ip": db.get("ip") });
});

app.post("/history/delay", (req, res) => {
  db.set("millis", (req.body.delay == 0)? DEFAULT_MILLIS_DELAY : req.body.delay).write();
  res.json({ "delay": req.body.delay });
});

app.post("/history/night", (req, res) => {
  var night = {};
  night.enabled = DEFAULT_NIGHT_MODE_ENABLED;
  night.start = (req.body.start == 0)? DEFAULT_NIGHT_MODE_START_HOUR : parseInt(req.body.start);
  night.end = (req.body.end == 0)? DEFAULT_NIGHT_MODE_END_HOUR : parseInt(req.body.end);
  night.millis = (req.body.millis == 0)? DEFAULT_NIGHT_MODE_MILLIS_DELAY : req.body.millis;
  
  db.set("night", night).write();

  fastmile.reloadNightModeTimer(db);

  res.json({ "night": night });
});

app.get("/history", (req, res) => {
  var limit = (typeof req.body.limit === 'undefined' || req.body.limit == 0) ? DEFAULT_HISTORY_GET_LIMIT : parseInt(req.body.limit);
  res.json({ "signals": db.get("signals").orderBy("time", "desc").slice(0, limit) });
});

app.get("/changes", (req, res) => {
  var limit = (typeof req.body.limit === 'undefined' || req.body.limit == 0) ? DEFAULT_CHANGES_GET_LIMIT : parseInt(req.body.limit);
  res.json({ "changes": db.get("changes").orderBy("time", "desc").slice(0, limit) });
});

app.get("/speedtests", (req, res) => {
  // var limit = (typeof req.body.limit === 'undefined' || req.body.limit == 0) ? DEFAULT_CHANGES_GET_LIMIT : parseInt(req.body.limit);
  res.json({ "speedtests": db.get("speedtest").value().list.reverse().slice(0, 12) });
});

app.use('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/express/index.html'));
});

app.listen(PORT, () => {
  console.log("Listening on port " + PORT);
  fastmile.startTimer(db.get("ip"), db);
  fastmile.startSpeedtestTimer(db);
});