const https = require("https");
const HTMLParser = require('node-html-parser');
const { DateTime } = require("luxon");

var nightModeSwitchTimeout;
const CA_NOT_AVAILABLE = 'CA Not Available';


function getStatusPage(ip, callback) {
  https.get("https://" + ip + "/status.php", res => {
    var htmlPageChunks = [];

    res.on('data', c => {
      htmlPageChunks.push(c);
    });

    res.on('end', () => {
      const htmlPage = Buffer.concat(htmlPageChunks).toString();
      callback(htmlPage);
    });

  }).on('error', function(err) {
    console.log(err);
  });
}

function addStatusToDatabase(db, htmlPage) {

  var primaryData = getStatusPrimaryData(htmlPage);
  var secondaryData = getStatusSecondaryData(htmlPage);
  
  var previousSignalStatus = db.get("signals").orderBy("time", "desc").value()[0];

  if (typeof previousSignalStatus !== 'undefined' && Object.keys(previousSignalStatus.primary).length !== 0) {
    if (Object.keys(primaryData).length !== 0 && previousSignalStatus.primary.band != primaryData.band) {
      db.get("changes").push({ "time": Date.now(), "primary" : previousSignalStatus.primary.band + " -> " + primaryData.band }).write();
    } else if (Object.keys(primaryData).length === 0) {
      db.get("changes").push({ "time": Date.now(), "primary" : previousSignalStatus.primary.band + " -> " + "No data" }).write();
    }

    if (secondaryData.length !== 0 && previousSignalStatus.secondary.length != secondaryData.length) {
      db.get("changes").push({ "time": Date.now(), "secondary" : previousSignalStatus.secondary.map(s => s.band) + " -> " + secondaryData.map(s => s.band) }).write();
    } else if (secondaryData.length === 0 && previousSignalStatus.secondary.length != 0) {
      db.get("changes").push({ "time": Date.now(), "secondary" : previousSignalStatus.secondary.map(s => s.band) + " -> " + "No aggregation" }).write();
    }
    
  } else if (typeof previousSignalStatus !== 'undefined' && Object.keys(previousSignalStatus.primary).length === 0) {
    if (Object.keys(primaryData).length !== 0) {
      db.get("changes").push({ "time": Date.now(), "primary" : "No data" + " -> " + primaryData.band }).write();
    }
  }

  db.get("signals").push({ "time": Date.now(), "primary" : primaryData, "secondary" : secondaryData }).write();
  if (db.get('signals').value().length > 30) {
    db.get('signals').remove({ "time": db.get('signals').value()[0].time }).write();
  }
  if (db.get('changes').value().length > 30) {
    db.get('changes').remove({ "time": db.get('changes').value()[0].time }).write();
  }

}

function setStatusTimer(ip, db) {
  getStatusPage(ip, (htmlPage) => {
    addStatusToDatabase(db, htmlPage);
  });
  setTimeout(() => {
    setStatusTimer(ip, db); 
  }, db.get("night").value().enabled ? db.get("night").value().millis : db.get("millis").value() );
}

function getStatusSecondaryData(htmlPage) {
  var rootElement = HTMLParser.parse(htmlPage);
  var secondaryCellBands = rootElement.querySelector('#bandDL-val').rawText.split('+');

  if (secondaryCellBands[0] != CA_NOT_AVAILABLE) {
    // PCI  eARFCN  CellType  RSRP  RSRQ  RSSI  CINR
    var secondaryCellSignals = rootElement.querySelectorAll('.card-sevencol-grid')[1].querySelectorAll('.name-of-value-in-card-bold');

    var secondaryCellInfos = [];
    for (var i = 0; i < secondaryCellBands.length; i++) {
      var secondaryCellInfo = {};
      secondaryCellInfo["band"] = secondaryCellBands[i].replace('B', '');
      secondaryCellInfo["pci"] = secondaryCellSignals[(7*i) + 0].innerText;
      secondaryCellInfo["earfcn"] = secondaryCellSignals[(7*i) + 1].innerText;
      secondaryCellInfo["rsrp"] = secondaryCellSignals[(7*i) + 3].innerText;
      secondaryCellInfo["rsrq"] = secondaryCellSignals[(7*i) + 4].innerText;
      secondaryCellInfo["rssi"] = secondaryCellSignals[(7*i) + 5].innerText;
      secondaryCellInfo["sinr"] = secondaryCellSignals[(7*i) + 6].innerText;
      secondaryCellInfos.push(secondaryCellInfo);
    }

    return secondaryCellInfos;
  } else {
    return [];
  }

}

function getStatusPrimaryData(htmlPage) {
  var rootElement = HTMLParser.parse(htmlPage);
  var primaryCellBand = rootElement.querySelector('#attached-cell-val').getElementsByTagName("span");

  // PCI  eARFCN  CellType  RSRP  RSRQ  RSSI  CINR
  var primaryCellSignal = rootElement.querySelectorAll('.card-sevencol-grid')[0].querySelectorAll('.name-of-value-in-card-bold');
  if (typeof primaryCellSignal !== 'undefined' && typeof primaryCellSignal[1] !== 'undefined') {
    return {
      "enbid" : primaryCellBand[0].innerText, 
      "cell-id" : primaryCellBand[1].innerText, 
      "band" : primaryCellBand[2].innerText,
      "pci" : primaryCellSignal[0].innerText,
      "earfcn" : primaryCellSignal[1].innerText,
      "rsrp" : primaryCellSignal[3].innerText,
      "rsrq" : primaryCellSignal[4].innerText,
      "rssi" : primaryCellSignal[5].innerText,
      "sinr" : primaryCellSignal[6].innerText,
    };
  } else {
    return {};
  }
}

function setNightMode(nightEnabled, db) {
  var night = db.get("night").value();
  night.enabled = nightEnabled;
  db.set("night", night).write();
}

function isNightModeRange(db) {
  var dateTimeNow = DateTime.now();

  if (db.get("night").value().start > db.get("night").value().end) {
    return (dateTimeNow.hour >= db.get("night").value().start || dateTimeNow.hour < db.get("night").value().end);
  }
  
  return (dateTimeNow.hour >= db.get("night").value().start && dateTimeNow.hour < db.get("night").value().end);
}

function setNightModeSwitchTimeout(enable, hour, callback) {
  var dateTimeNow = DateTime.now();
  var dateTimeSwitch = DateTime.local(dateTimeNow.year, dateTimeNow.month, dateTimeNow.day, hour);
  if (enable && dateTimeNow.hour > hour) {
    dateTimeSwitch.plus({ hours: 24 });
  }
  nightModeSwitchTimeout = setTimeout(() => {
    callback(enable);
  }, dateTimeSwitch.toMillis() - dateTimeNow.toMillis() + 60000);
}

function setNightModeTimer(db) {
  if (isNightModeRange(db)) {
    setNightModeSwitchTimeout(false, db.get("night").value().end, (enable) => {
      setNightMode(enable, db);
      setNightModeTimer(db);
    });
  } else {
    setNightModeSwitchTimeout(true, db.get("night").value().start, (enable) => {
      setNightMode(enable, db);
      setNightModeTimer(db);
    });
  }
}

function setNightModeOnStartup(db) {
  if (isNightModeRange(db)) {
    setNightModeSwitchTimeout(false, db.get("night").value().end, (enable) => {
      setNightMode(enable, db);
    });
  } else {
    setNightModeSwitchTimeout(true, db.get("night").value().start, (enable) => {
      setNightMode(enable, db);
    });
  }
}

exports.now = (ip, db, callback) => {
  getStatusPage(ip, (htmlPage) => {
    addStatusToDatabase(db, htmlPage);
    callback(db.get("signals").orderBy("time", "desc").value()[0]);
  });
}

exports.timer = (ip, db) => {
  setStatusTimer(ip, db);
  setNightModeOnStartup(db);
  setNightModeTimer(db);
}

exports.reloadNightModeTimer = (db) => {
  clearTimeout(nightTimeout);
  setNightModeTimer(db);
}