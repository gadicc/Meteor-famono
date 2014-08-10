Package.describe({
  version: '0.7.3',
  summary: 'Library bundler supports use of libraries like Famo.us, via git/bower and requireJS/commonJS/AMD/UMD'
});

Package._transitional_registerBuildPlugin({
  name: 'compileRequirejs',
  use: [],
  sources: [
    'compile_requirejs.js' // The holy grail!!
  ],
  npmDependencies: {
    'sync-exec': '0.3.2', // exec sync - we could also just run in a fiber?
    'famono': '0.0.9', // Our way of to require famono_lib.js
    'chokidar': '0.8.2' // For watching local files..
  }
});

Npm.depends({
  send: '0.1.4', // Serving library files async / lazyloading
  useragent: "2.0.7" // Ment for client specific bundles?
});

Package.on_use(function(api) {
  'use strict';

  api.use('webapp', 'server');  // Used for serving files
  api.use('reload', 'client'); // Not sure if we are using this?
  api.use('routepolicy', 'server'); // Not sure if this is used...

  //api.versionsFrom && api.versionsFrom('METEOR-CORE@0.9.0-preview4');

  api.add_files([
    // Just noop server-side api warning if used on server
    'requirejs_server.js',
    // The library lazyloading server
    'requirejs_libraries_server.js'
  ], 'server');

  // This is browser client side require / define api
  api.add_files('requirejs_client.js', 'client');

  // api.export('define');
  // api.export('require');
  api.export('Famono');
});