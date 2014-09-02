Package.describe({
  name: "raix:famono",
  version: '0.8.2',
  summary: 'Library bundler supports use of libraries like Famo.us, via git/bower and requireJS/commonJS/AMD/UMD'
});

Package._transitional_registerBuildPlugin({
  name: 'compileRequirejs',
  use: [ 'underscore', 'raix:famono-binary-deps' ],
  sources: [
    'compile_requirejs.js' // The holy grail!!
  ]
});

Package.on_use(function(api) {
  'use strict';

  api.versionsFrom('METEOR@0.9.0');
  api.use('webapp', 'server');  // Used for serving files
  api.use('reload', 'client'); // Not sure if we are using this?
  api.use('routepolicy', 'server'); // Not sure if this is used...

  api.use('raix:famono-binary-deps@1.0.0', 'server');

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