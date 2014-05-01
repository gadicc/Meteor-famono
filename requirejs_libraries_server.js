var fs = Npm.require('fs');
var path = Npm.require('path');
var send = Npm.require('send');

// Set the main famono folder for our work...
var famonoRepoFolder = path.resolve(process.cwd(), '../../../../.famono-repos');

var famonoLibFolder = path.join(famonoRepoFolder, 'lib');

var config;
var registry = {};

// Make sure famonoLibFolder exists
if (!fs.existsSync(famonoLibFolder)) {
  console.log('Famono: Error lib folder not found "' + famonoLibFolder + '"');
} else {
  // Load config and registry into mem

  try {
    config = JSON.parse(fs.readFileSync(path.join(famonoRepoFolder, '.config'), 'utf8'));
  } catch (err) {
    throw new Error('Famono: Error could not parse .config json, ' + err.message);
  }

  for (var ns in config) {
    try {
      registry[ns] = JSON.parse(fs.readFileSync(path.join(famonoRepoFolder, '.' + ns), 'utf8'));
    } catch (err) {
      console.log('Famono: Error namespace config load failed "' + ns + '"');
    }
  }

}

var getExt = function(url) {
  var last = url.split('.').pop();
  // Only allow certain filetypes?
  if (last === 'js' || last === 'css')
    return '.' + last;

  return;
};

var getNamespace = function(url) {
  var list = url.split('/');
  // '' lib namespace foo bar
  //  0  1      2      3   4
  return list[2];
};

var getLibrary = function(url) {
  // Remove the lib part
  var name = url.replace('/lib/', '');
  // Get the extension
  var ext = getExt(url);
  // Remove the ext if found
  if (ext) name = name.substring(0, name.length - ext.length);
  // Return the name
  return {
    name: name,
    ext: ext
  };
};


WebApp.connectHandlers.use(function(req, res, next) {
  // Check if the user requested something in the /lib/ folder 
  if (/^\/lib\//.test(req.url)) {
    if (!config) {
      // Set error
      res.writeHead(500);
      // If no config loaded then report as an error
      res.end('Famono: Error registry not found in "' + famonoRepoFolder + '"');
    } else {
      // Get the namespace
      var namespace = getNamespace(req.url);
      // Get the lib info
      var lib = getLibrary(req.url);
      // Get the library name
      var name = lib.name;
      // Get the extension
      var ext = lib.ext;

      // console.log(namespace);
      var currentNS = registry[namespace];
      // Check that we have the namespace
      if (currentNS) {
        // Check if we need to add index
        if (currentNS[name + '/index']) name += '/index';

        // Check that we have the dependency
        if (currentNS[name]) {
          // Get the filename of the dependency
          var filename = path.join(famonoLibFolder, name + (ext || '.js'));
          // Serve the file
          send(req, filename)
            //.maxage(maxAge)
            .on('error', function(err) {
              Log.error('Error serving library "' + name + '", file: ' + filename + ' ' + err);
              res.writeHead(500);
              res.end();
            })
            .on('directory', function() {
              Log.error("Unexpected directory " + filename);
              res.writeHead(500);
              res.end();
            })
            .pipe(res);

        } else {
          // Set error
          res.writeHead(404);

          var found;
          for (var key in currentNS)
            if (name.toLowerCase() == key.toLowerCase()) found = { key: key, name: name};

          if (found) {
            // Show nicer error message
            res.end('Famono: Error, did you mean "' + found.key + '" instead of "' + found.name + '"?');
          } else {
            // If no config loaded then report as an error
            res.end('Famono: Error, library not found in "' + name + '"');
          }
        }

      } else {
        // Set error
        res.writeHead(400);
        // If no config loaded then report as an error
        res.end('Famono: Error namespace not found "' + namespace + '"');
      }
    }

  } else {
    // Pass on other urls than `/lib/`
    return next();
  }


});