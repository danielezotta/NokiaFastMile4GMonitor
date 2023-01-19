const https = require("https");
const HTMLParser = require('node-html-parser');

function saveData(ip, db) {

  setInterval(() => {

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
      });
  
    }).on('error', function(err) {
      console.log(err);
    });

  }, db.get("millis"));

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

exports.timer = (ip, db, response) => {
  saveData(ip, db);
  // response.send({ "delay": delay + " ms", "ip": ip });
}