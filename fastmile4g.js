const https = require("https");
const HTMLParser = require('node-html-parser');
var nightTimeout;

function saveData(ip, db) {

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

  https.get("https://" + ip + "/status.php", res => {

    var page = [];

    res.on('data', c => {
      page.push(c);
    });

    res.on('end', () => {
      const data = Buffer.concat(page).toString();
      var primaryData = getPrimaryData(data);
      var secondaryData = getSecondaryData(data);
      
      prevRecording = db.get("signals").orderBy("time", "desc").value()[0];
      prevPrevRecording = db.get("signals").orderBy("time", "desc").value()[1];

      if (typeof prevRecording !== 'undefined' && Object.keys(prevRecording.primary).length !== 0) {
        if (Object.keys(primaryData).length !== 0 && prevRecording.primary.band != primaryData.band) {
          db.get("changes").push({ "time": Date.now(), "primary" : prevRecording.primary.band + " -> " + primaryData.band }).write();
        } else if (Object.keys(primaryData).length === 0) {
          db.get("changes").push({ "time": Date.now(), "primary" : prevRecording.primary.band + " -> " + "No data" }).write();
        }

        if (secondaryData.length !== 0 && prevRecording.secondary.length != secondaryData.length) {
          db.get("changes").push({ "time": Date.now(), "secondary" : prevRecording.secondary.map(s => s.band) + " -> " + secondaryData.map(s => s.band) }).write();
        } else if (secondaryData.length === 0 && prevRecording.secondary.length != 0) {
          db.get("changes").push({ "time": Date.now(), "secondary" : prevRecording.secondary.map(s => s.band) + " -> " + "No aggregation" }).write();
        }
        
      } else if (typeof prevRecording !== 'undefined' && Object.keys(prevRecording.primary).length === 0) {
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
    });

  }).on('error', function(err) {
    console.log(err);
  });

}

function setTimer(ip, db) {
  setTimeout(() => {
    saveData(ip, db);
    setTimeout(() => { setTimer(ip, db); }, (db.get("night").value().enabled) ? db.get("night").value().millis : db.get("millis"));
  }, (db.get("night").value().enabled) ? db.get("night").value().millis : db.get("millis") );
}

function getSecondaryData(html) {
  var root = HTMLParser.parse(html);
  var secondaryCellBands = root.querySelector('#bandDL-val').rawText.split('+');

  if (secondaryCellBands[0] != 'CA Not Available') {
    // PCI  eARFCN  CellType  RSRP  RSRQ  RSSI  CINR
    var secondarySignal = root.querySelectorAll('.card-sevencol-grid')[1].querySelectorAll('.name-of-value-in-card-bold');

    var aggregatedInfos = [];
    for (var i = 0; i < secondaryCellBands.length; i++) {
      var obj = {};
      obj["band"] = secondaryCellBands[i].replace('B', '');
      obj["pci"] = secondarySignal[(7*i) + 0].innerText;
      obj["earfcn"] = secondarySignal[(7*i) + 1].innerText;
      obj["rsrp"] = secondarySignal[(7*i) + 3].innerText;
      obj["rsrq"] = secondarySignal[(7*i) + 4].innerText;
      obj["rssi"] = secondarySignal[(7*i) + 5].innerText;
      obj["sinr"] = secondarySignal[(7*i) + 6].innerText;
      aggregatedInfos.push(obj);
    }

    return aggregatedInfos;
  } else {
    return [];
  }

}

function getPrimaryData(html) {
  var root = HTMLParser.parse(html);
  var primaryCellData = root.querySelector('#attached-cell-val').getElementsByTagName("span");

  // PCI  eARFCN  CellType  RSRP  RSRQ  RSSI  CINR
  var primarySignal = root.querySelectorAll('.card-sevencol-grid')[0].querySelectorAll('.name-of-value-in-card-bold');
  if (typeof primarySignal !== 'undefined') {
    return { 
      "enbid" : primaryCellData[0].innerText, 
      "cell-id" : primaryCellData[1].innerText, 
      "band" : primaryCellData[2].innerText,
      "pci" : primarySignal[0].innerText,
      "earfcn" : primarySignal[1].innerText,
      "rsrp" : primarySignal[3].innerText,
      "rsrq" : primarySignal[4].innerText,
      "rssi" : primarySignal[5].innerText,
      "sinr" : primarySignal[6].innerText,
    };
  } else {
    return {};
  }
}

function setNight(b, db) {
  var night = db.get("night").value();
  night.enabled = b;
  db.set("night", night).write();

  setNightTimer(db);
}

function setNightTimer(db) {
  var dateNow = new Date();
  
  var condition = false;  
  if (db.get("night").value().start > db.get("night").value().end) {
    condition = (dateNow.getHours() >= db.get("night").value().start || dateNow.getHours() < db.get("night").value().end);
  } else {
    condition = (dateNow.getHours() >= db.get("night").value().start && dateNow.getHours() < db.get("night").value().end);
  }

  if (condition) {
    var dateTimer = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate(), db.get("night").value().end);
    nightTimeout = setTimeout(() => {
      setNight(false, db);
    }, dateTimer.getTime() - dateNow.getTime() + 60000);
  } else {
    var dateTimer = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate(), db.get("night").value().start);
    if (dateNow.getHours() > db.get("night").value().start) {
      dateTimer = new Date(dateTimer.getTime() + 86400000);
    }
    nightTimeout = setTimeout(() => {
      setNight(true, db);
    }, dateTimer.getTime() - dateNow.getTime() + 60000);
  }
}

function setNightStartup(db) {
  var dateNow = new Date();

  var condition = false;  
  if (db.get("night").value().start > db.get("night").value().end) {
    condition = (dateNow.getHours() >= db.get("night").value().start || dateNow.getHours() < db.get("night").value().end);
  } else {
    condition = (dateNow.getHours() >= db.get("night").value().start && dateNow.getHours() < db.get("night").value().end);
  }

  var night = db.get("night").value();
  night.enabled = condition;
  db.set("night", night).write();
}

exports.now = (ip, response) => {
  
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

  https.get("https://" + ip + "/status.php", res => {

    var page = [];

    res.on('data', c => {
      page.push(c);
    });

    res.on('end', () => {
      const data = Buffer.concat(page).toString();
      var primaryData = getPrimaryData(data);
      var secondaryData = getSecondaryData(data);
      response.send({ "primary" : primaryData, "secondary" : secondaryData });
    });

  }).on('error', function(err) {
    console.log(err);
  });
}

exports.timer = (ip, db) => {
  setTimer(ip, db);
  setNightStartup(db);
  setNightTimer(db);
}

exports.reloadNightTimer = (db) => {
  clearTimeout(nightTimeout);
  setNightTimer(db);
}