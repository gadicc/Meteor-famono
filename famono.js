#!/usr/bin/env node
/*

  We create jsdoc into gh-pages submodule in folder "docs" and auto push changes

*/


// CLI Options
var program = require('commander');
// CLI Colored text
var colors = require('colors');
// CLI Progress bar
var ProgressBar = require('progress');
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

program
  .version('0.0.1')
  .option('-a, --add <name>', 'Add library')
  .option('-d, --del <name>', 'Remove library')
  .option('-l, --list', 'List of used libraries')
  .option('-p, --path <path>', 'use git or local path')

  .parse(process.argv);


if (!fs.existsSync(configPath)) {
  console.log('Famono: Error, cannot find famono in this folder');
  process.exit(0);
}

var loadFromJSON = function(pathName) {
  try {
    return JSON.parse(fs.readFileSync(pathName, 'utf8'));
  } catch(err) {
    return null;
  }
};

var saveToJSON = function(pathName, obj) {
  try {
    fs.writeFileSync(pathName, JSON.stringify(obj, null, '\t'), 'utf8');
    return true;
  } catch(err) {
    console.log('Error', err.message);
    return null;
  }
};

var getBowerData = function(name, callback) {
  var data = '';
  http.get('http://bower.herokuapp.com/packages/' + name, function(res) {
    res.on('data', function (chunk) {
      data += chunk;
    });
    res.on('end', function (chunk) {
      try {
        callback(null, JSON.parse(data));
      }catch(err) {
        callback(new Error('Invalid JSON'));
      }
    });
  }).on('error', function(e) {
    callback(e);
  });
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
      console.log('Famono: ' + ((pathName)?'Added':'Removed') + ' package "' + name + '"');
    } else {
      console.log('Famono: Could not ' + ((pathName)?'add':'remove') + ' package name "' + name + '"');
    }
  } else {
    // No smart.require found
    console.log('Famono: Error, could not load smart.require');
  }
};

if (program.add) {

  if (program.path) {

    // Add the package
    setConfig(program.add, program.path);

  } else {

    getBowerData(program.add, function(err, result) {

      if (err) {
        console.log('Could not resolve package name "' + program.add + '", ' + err.message);
      } else {
        // Add the package
        setConfig(result.name, result.url);
      }

    });

  }

} else if (program.del) {

  // Remove the package
  setConfig(program.del);

} else if (program.list) {
  var config = loadFromJSON(configPath);
  if (config) {
    
    console.log('Used libraries:');
    
    for (var name in config)
      console.log('-', name);

  } else {
    console.log('Famono: Error, could not load smart.require');
  }
}