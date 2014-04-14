Package.describe({
    summary: 'Adds require bundler to Meteor use with Famo.us'
});

Package._transitional_registerBuildPlugin({
  name: "compileFamous",
  use: [],
  sources: [
    'compile-famous.js'
  ],
  npmDependencies: {
    'sync-exec': '0.3.2'
  }
});

var path = Npm.require('path');
var fs = Npm.require('fs');

var green = '\u001b[32m';
var gray = '\u001b[2m';
var white = '\u001b[1m';
var normal = '\u001b[0m';

console.log('');
console.log('', white);
console.log('F A M O N O', green);
console.log('-----------', normal);
console.log('The Famono package will rig the Famo.us package system into Meteor.js');
console.log('package system');
console.log('');
console.log('It adds the global "require" on the client');
console.log('It will rig dependencies on the client using "define"');
console.log('');
console.log('It also parses your source code when you change it, and figure');
console.log('out what libraries must be bundled for the client.');
console.log('');
console.log('You can add/remove libraries to the "lib/smart.require" and will');
console.log('download and keep the libraries updated via github.');
console.log('');
console.log('NOTE: Famono depends on', white, 'git!!', normal);
console.log('');
console.log('Kind regards Morten (aka raix)', green);
console.log('-----------', normal);


Package.on_use(function(api) {
  'use strict';

  // library folder to ensure load order
  var libFolder = path.join(process.cwd(), 'lib');
  // The filename of the smart.require
  var filename = path.join(libFolder, 'smart.require');
  
  if (!fs.existsSync(libFolder))
    fs.mkdirSync(libFolder);

  if (!fs.existsSync(filename)) {
    // Prepare the user and system on how this is going down...
    console.log(green, 'Famono:', normal, 'Creating "lib/smart.require" config file, for you to edit');

    var defaultDeps = JSON.stringify({
      'famous': {
        git: 'https://github.com/Famous/famous.git'
      },
      'famous-polyfills': {
        git: 'https://github.com/Famous/polyfills.git'
      }
    }, null, '\t');

    fs.writeFileSync(filename, defaultDeps, 'utf8');

    
  }

  api.use('webapp', 'server');
  api.use('reload', 'client');
  api.use('routepolicy', 'server');
  // api.use('underscore', 'server');
  // api.use('autoupdate', 'server', {weak: true});
  // api.add_files('appcache-client.js', 'client');
  // api.add_files('appcache-server.js', 'server');

  api.add_files('famous-server.js', 'server');
  api.add_files('famous-client.js', 'client');
  //api.add_files(filename, 'client');  
  //api.add_files('lib/testone.js', 'server', { 'public': true });


  //api.export('Famous');
  api.export('define', 'client');
  api.export('require', 'client');
});