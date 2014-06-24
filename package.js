Package.describe({
  summary: 'RequireJS bundler plugin for Meteor -- to support the use of frameworks like Famo.us.'
});

Package._transitional_registerBuildPlugin({
  name: 'compileRequirejs',
  use: [],
  sources: [
    'compile_requirejs.js'
  ],
  npmDependencies: {
    'sync-exec': '0.3.2',
    'famono': '0.0.9'
  }
});

Npm.depends({
  send: '0.1.4',
  useragent: "2.0.7"
});

Package.on_use(function(api) {
  'use strict';

  api.use('webapp', 'server');
  api.use('reload', 'client');
  api.use('routepolicy', 'server');

  api.add_files([
    'requirejs_server.js',
    'requirejs_libraries_server.js'
  ], 'server');

  api.add_files('requirejs_client.js', 'client');

  api.export('define');
  api.export('require');
});