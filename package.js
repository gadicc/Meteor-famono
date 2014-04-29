Package.describe({
    summary: 'Add RequireJS support to Meteor. To support the use of frameworks like Famo.us.'
});

Package._transitional_registerBuildPlugin({
  name: 'compileRequirejs',
  use: [],
  sources: [
    'compile_requirejs.js'
  ],
  npmDependencies: {
    'sync-exec': '0.3.2',
    'famono': '0.0.8'
  }
});

Npm.depends({ send: '0.1.4' });

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