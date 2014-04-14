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

Package.on_use(function(api) {
  'use strict';

  api.use('webapp', 'server');
  api.use('reload', 'client');
  api.use('routepolicy', 'server');

  api.add_files('famous-server.js', 'server');
  api.add_files('famous-client.js', 'client');

  //api.export('Famous');
  api.export('define');
  api.export('require');
});