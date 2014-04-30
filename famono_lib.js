// Filesystem
var fs = require('fs');
// Path
var path = require('path');
// http
var http = require('http');
// Get current path
var currentPath = path.resolve();
// Path of this script - Used by creating app from templates
var scriptPath = path.dirname(require.main.filename);
// The smart.require - if not found we are not in a famono app...
var configPath = path.join(currentPath, './lib/smart.require');

var cliTestForFamono = function() {

  if (!fs.existsSync(configPath)) {
    console.log('Famono: Error, cannot find famono in this folder');
    process.exit(0);
  }

};

var loadFromJSON = function(pathName) {
  try {
    return JSON.parse(fs.readFileSync(pathName, 'utf8'));
  } catch (err) {
    return null;
  }
};

var saveToJSON = function(pathName, obj) {
  try {
    fs.writeFileSync(pathName, JSON.stringify(obj, null, '\t'), 'utf8');
    return true;
  } catch (err) {
    console.log('Error', err.message);
    return null;
  }
};

var getBowerData = function(name, callback) {
  var data = '';
  http.get('http://bower.herokuapp.com/packages/' + name,function(res) {
    res.on('data', function(chunk) {
      data += chunk;
    });
    res.on('end', function(chunk) {
      try {
        callback(null, JSON.parse(data));
      } catch (err) {
        callback(new Error('Invalid JSON'));
      }
    });
  }).on('error', function(e) {
      callback(e);
    });
};

var loadConfig = function() {
  return loadFromJSON(configPath);
};

var setConfig = function(name, pathName) {
  // Load config
  var config = loadFromJSON(configPath);
  // if config found
  if (config) {

    // Set or unset the package
    if (!pathName) {
      // Delete the package
      delete config[name];
    } else {
      // Add the package
      config[name] = { git: pathName }
    }

    // Store the config
    if (saveToJSON(configPath, config)) {
      console.log('Famono: ' + ((pathName) ? 'Added' : 'Removed') + ' package "' + name + '"');
    } else {
      console.log('Famono: Could not ' + ((pathName) ? 'add' : 'remove') + ' package name "' + name + '"');
    }
  } else {
    // No smart.require found
    console.log('Famono: Error, could not load smart.require');
  }
};

var setConfigObject = function(obj) {
  // Load config
  var config = loadFromJSON(configPath);
  // if config found
  if (config) {
    var namelist = [];

    for (var name in obj) {
      // Add to the name list
      namelist.push(name);

      // Get the pathname
      var pathName = obj[name];

      // Add the package
      config[name] = { git: pathName }

    }

    if (namelist.length) {

      // Store the config
      if (saveToJSON(configPath, config)) {
        console.log('Famono: Added "' + namelist.join('", "') + '"');
      } else {
        console.log('Famono: Could not update the library registry');
      }

    } else {
      // Well nothing to work with really...
    }
  } else {
    // No smart.require found
    console.log('Famono: Error, could not load the library registry');
  }
};

module.exports = {
  loadFromJSON: loadFromJSON,
  saveToJSON: saveToJSON,
  getBowerData: getBowerData,
  loadConfig: loadConfig,
  setConfig: setConfig,
  setConfigObject: setConfigObject,
  cliTestForFamono: cliTestForFamono
};