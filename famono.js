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
// Use the famono lib
var lib = require('./famono_lib');

program
  .version('0.0.3')
  .option('-a, --add <name>', 'Add library')
  .option('-d, --del <name>', 'Remove library')
  .option('-l, --list', 'List of used libraries')
  .option('-p, --path <path>', 'use git or local path')

  .parse(process.argv);

// Make sure we are in the right folder
cliTestForFamono();

if (program.add) {

  if (program.path) {

    // Add the package
    lib.setConfig(program.add, program.path);

  } else {

    lib.getBowerData(program.add, function(err, result) {

      if (err) {
        console.log('Could not resolve package name "' + program.add + '", ' + err.message);
      } else {
        // Add the package
        lib.setConfig(result.name, result.url);
      }

    });

  }

} else if (program.del) {

  // Remove the package
  lib.setConfig(program.del);

} else if (program.list) {
  var config = lib.loadConfig();
  if (config) {

    console.log('Used libraries:');

    for (var name in config)
      console.log('-', name);

  } else {
    console.log('Famono: Error, could not load smart.require');
  }
}