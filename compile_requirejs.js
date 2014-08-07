// TODO:
// * add library watch to reload on library changes when developing
// * add better parser allowing capture of foo['bar-bar']
// * all index loads in global definitions should be added before or extending
//   afterwards
// * deprecate internal use of Famono.require and Famono.define use direct
//   function loads
// * make the client require check global scope for dependencies, making it
//   compatible with the library globals
// * UMD universal module definition support - we could actually wrap all module
//   code in this pattern, then use uglify etc. to make the code parse clean,
//   removing all the dead code?
// * Make famono relax about location of lib/smart.require
// * Extract / isolate the library server for lazyloading and have it serve libs
//   in the UMD format?

var fs = Npm.require('fs');
var path = Npm.require('path');
var exec = Npm.require('sync-exec');
var lib = Npm.require('famono');

var http = Npm.require('http');

var chokidar = Npm.require('chokidar');

var red = '\u001b[31m';
var green = '\u001b[32m';
var gray = '\u001b[2m';
var white = '\u001b[1m';
var normal = '\u001b[0m';
var yellow = '\u001B[0;33m';

// Changing this will force a rerun of deps - this makes it easier for the users
// to migrate into newer versions of Famono
var version = '0.1.9';
// This object will contain the library registry when compiling
var libraryRegistry = {};
// This array will contain library globals, at the moment we got stuff like
// famous-polyfills its should really be famous.polyfills or something with an
// alias "famous-polyfills" - this way we get a proper js scope and compability
// with requirejs reference model.
var libraryGlobals = [];

// app module registry
var appModuleRegistry = {};

// The expected .meteor folder
var meteorFolder = path.join(process.cwd(), '.meteor');

// If this folder is not found then exit silently - we could be in a publish
// XXX: At the moment we have no clue if this is run in meteor publish or
// simply out side a meteor app - we cannot warn the user at the moment.
if (!fs.existsSync(meteorFolder))
  return;

// Set the main famono folder for our work -- to hold the uncompiled requirejs repositories.
var famonoRepoFolder = path.join(meteorFolder, '.famono-repos');
// Make sure famonoRepoFolder exists
if (!fs.existsSync(famonoRepoFolder)) fs.mkdirSync(famonoRepoFolder);

// Make sure we can work here.
if (!fs.existsSync(famonoRepoFolder))
  throw new Error('Famono cannot create any files - make sure you have the necessary rights to the filesystem');

var famonoBaseFolder = path.join(meteorFolder, '.famono-base');
// Make sure famonoBaseFolder exists
if (!fs.existsSync(famonoBaseFolder)) fs.mkdirSync(famonoBaseFolder);

// We move this out of the way - making sure we have a full namespace in the
// famono-repo
var configFolder = path.join(famonoBaseFolder, '.config');
var famonoLibFolder = path.join(famonoBaseFolder, 'lib');

// Make sure famonoLibFolder exists.
if (!fs.existsSync(famonoLibFolder)) fs.mkdirSync(famonoLibFolder);

var versionFile = path.join(famonoLibFolder, '.version');

var installationNote = function() {
  console.log('');
  console.log('', white);
  console.log('F A M O N O', green);
  console.log('-----------', normal);
  console.log('The Famono package will rig the requirejs package system into Meteor.js');
  console.log('package system');
  console.log('');
  console.log('It adds the global "require" on the client');
  console.log('It will rig dependencies on the client using "define"');
  console.log('');
  console.log('It also parses your source code when you change it, and figures');
  console.log('out what libraries must be bundled for the client.');
  console.log('');
  console.log('You can add/remove libraries to the "lib/smart.require" and will');
  console.log('download and keep the libraries updated via github.');
  console.log('');
  console.log('NOTE: Famono depends on', white, 'git!!', normal);
  console.log('');
  console.log('Kind regards Morten (aka raix)', green);
  console.log('-----------', normal);
};

var installationGitIgnore = function() {
  var gitignoreFolder = path.join(process.cwd(), '.meteor', '.gitignore');
  var contents = '';
  try {
    contents = fs.readFileSync(gitignoreFolder, 'utf8');
  } catch (err) {
    // Prop. not found...
  }
  // Remove the .famono-repos
  contents = contents.replace('.famono-repos\n', '');
  // Add the .famono-repos
  contents += '.famono-repos\n';
  // Remove the .famono-repos
  contents = contents.replace('.famono-base\n', '');
  // Add the .famono-base
  contents += '.famono-base\n';
  // Write the file again...
  fs.writeFileSync(gitignoreFolder, contents, 'utf8');
};

var installationCheck = function() {
  // library folder to ensure load order
  var libFolder = path.join(process.cwd(), 'lib');
  // The filename of the smart.require
  var filename = path.join(libFolder, 'smart.require');

  if (!fs.existsSync(libFolder))
    fs.mkdirSync(libFolder);

  if (!fs.existsSync(filename)) {
    installationNote();
    // Add to ignore
    installationGitIgnore();
    // Prepare the user and system on how this is going down...
    console.log(green, 'Famono:', normal, 'Creating "lib/smart.require" config file, for you to edit');

    var defaultDeps = JSON.stringify({
      // 'famous': {
      //   git: 'https://github.com/Famous/famous.git'
      // },
      'famous': {
        git: 'https://github.com/raix/famous.git',
        branch: 'famono'
      },
      'famous.polyfills': {
        git: 'https://github.com/Famous/polyfills.git'
      },
      'library': {
        git: 'https://github.com/raix/library.git'
      },
      'famous-polyfills': {
        alias: 'famous.polyfills'
      }      
    }, null, '\t');

    fs.writeFileSync(filename, defaultDeps, 'utf8');

  }
};

var namespaceErrors = {};
var namespaceError = function(name, filename) {
  if (!namespaceErrors[name] && !appModuleRegistry[name]) {

    console.warn(yellow, 'Famono:', normal, 'Warning, could not load library namespace "' + name + '" file:', filename);
    // Hinder more errors on the namespace...
    namespaceErrors[name] = true;

  }
};

var libraryErrors = {};
var libraryError = function(name, lookup, filename) {
  if (!libraryErrors[name] && !appModuleRegistry[name]) {

    console.warn(yellow, 'Famono:', normal, 'Warning, could not load library "' + name + '" file:', filename);

    if (!lookup[name]) {
      var found;
      for (var key in lookup)
        if (name.toLowerCase() == key.toLowerCase()) found = { key: key, name: name};

      if (found)
        console.warn(yellow, 'Famono:', normal, 'Did you mean "' + found.key + '" instead of "' + found.name + '"?');
    } else {
      // Some other error
    }
    // Hinder more errors on the namespace...
    libraryErrors[name] = true;

  }
};

var fileProperties = function(folder, name) {
  // Split the file name by '.'
  var split = name.split('.');
  // Add support for coffee.md
  if (/coffee\.md$/.test(name)) split.push('coffee.md');

  return {
    folder: folder,
    name: name,
    filename: path.join(folder, name),
    isDotted: (split[0] === ''),
    ext: split.pop().toLowerCase()
  };
};

/**
 * @method eachFile
 * @param {Function} callback ({folder, filename, name, level, index, ext, isDotted})
 * @returns {Array} list of javascript filenames in the bundle
 */
var eachFile = function(folder, callback, dotted, level, crawledFolders, ignoreFolders) {
  // Make sure we get the real path, credit @gadicc
  folder = fs.realpathSync(folder);
  // Build on the crawled folders or create new object
  crawledFolders = crawledFolders || {};
  // Make sure we dont crawl stuff already crawled
  if (typeof crawledFolders[folder] !== 'undefined')
    return;
  // Remember the url
  crawledFolders[folder] = true;
  // Get the list of files
  var fileList = fs.readdirSync(folder);
  // Make sure we have a proper level
  level = level || 0;

  ignoreFolders = ignoreFolders || [];

  for (var i = 0; i < fileList.length; i++) {
    // Keep nice reference to the filename
    var name = fileList[i];

    var file = fileProperties(folder, name);

    // Get the file stats
    var stats = fs.statSync(file.filename);
    // Show this dotted, if dotted is true we dig into dotted folders
    var showDotted = (dotted === true && file.isDotted) || (!file.isDotted);
    // We only iterate over non-dotted javascript files - this should be
    // recursive, avoiding private, public and server folders
    if (stats.isFile())
      callback({
        folder: folder,
        filename: file.filename,
        name: name,
        level: level,
        index: i,
        ext: file.ext,
        isDotted: file.isDotted
      });

    if (showDotted && stats.isDirectory()) {
      // continue if the folder should be ignored
      if (ignoreFolders && ignoreFolders.indexOf(file.filename) > -1) continue;
      eachFile(file.filename, callback, dotted, level + 1, crawledFolders);
    }
  }
};

/**
 * @objectMerge
 * @params {Objects} arg0 .. argn Objects to merge
 */
var objectMerge = function(/* object1 .. objectN */) {
  var result = {};
  for (var i = 0; i < arguments.length; i++) {
    // Get the current object
    var o = arguments[i];
    // Iterate over keys
    for (var key in o) {
      // Set the key and value in the result object
      result[key] = o[key];
    }
  }
  // Return the merged object
  return result;
}

/**
 * @method removeFolder
 * @param {String} pathName
 */
var removeFolder = function(pathName) {
  // Get the list of files
  try {
    var fileList = fs.readdirSync(pathName);
    // Empty the folder first
    for (var i = 0; i < fileList.length; i++) {
      // Filename
      var filename = fileList[i];
      // path name
      var filePath = path.join(pathName, filename);
      // Get the stats
      var stats = fs.statSync(filePath);
      // Check if we got a folder
      if (stats.isDirectory()) {
        // Remove folders recursive
        removeFolder(filePath);
      } else {
        // Remove files
        fs.unlinkSync(filePath);
      }
    }
    // Remove the empty folder
    fs.rmdirSync(pathName);
  } catch (err) {
    // Nothing - we dont have a folder to remove
  }
};

var ensureFolder = function(folder) {
  // Get the folderList
  var folderList = folder.split(path.sep);
  folderList.shift();
  // Init pathname
  var pathName = '';
  for (var i = 0; i < folderList.length; i++) {
    pathName += path.sep + folderList[i];
    // Check if the path exists, if not the create the folder
    if (!fs.existsSync(pathName))
      fs.mkdirSync(pathName);
  }
};

var resolveDepPath = function(currentPath, depPath) {
  var resolved = path.resolve(currentPath, depPath).substring(1);
  // Sometimes people put extensions in here too - we will remove it if js or css
  var list = resolved.split('.');
  // Check if the last segment is js or css
  if (/^js$|^css$/.test(list[list.length - 1])) list.pop();
  // Join the list into the resolved again
  resolved = list.join('.');
  // Return the resolved dep path
  return resolved;
};

var isStringMode = function(mode) {
  return (mode === 'single-string' || mode === 'double-string');
};

var isCommentMode = function(mode) {
  return (mode === 'line-comment' || mode === 'block-comment');
};

// Takes a string to parse
var parseArray = function(str) {
  var result = [];
  var mode = 'code';
  var lastMode = 'code';
  var word = '';
  var escape = false;
  var lastEscape = false;

  // Check format
  if (str[0] !== '[' || str[str.length-1] !== ']')
    throw new Error('Could not parse string, expected "[]"');

  // Runner
  for (var i = 1; i < str.length-1; i++) {
    var cp = str[i-1];
    var c = str[i];
    var cn = str[i+1];
    
    // Check previous char
    escape = (cp === '\\') && !lastEscape;

    if (mode == 'code') {
      if (c == '"' && !escape) mode = 'double-string';
      if (c == "'" && !escape) mode = 'single-string';
    } else {
      if (mode === 'double-string' && c == '"' && !escape) mode = 'code';
      if (mode === 'single-string' && c == "'" && !escape) mode = 'code';
    }

    if (mode !== lastMode) c = "'";

    if (mode == 'code' && c == ' ') {
      // Ignore whitespace when in code
    } else if (mode == 'code' && c == ',') {
      // comma is seperator in arrays
      result.push(word);
      word = '';

    } else {
      word += c;
    }

    // Remember
    lastMode = mode;
    lastEscape = escape;
  }

  // Push the last word if any?
  if (word) result.push(word);

  return result;
};


var parserResolveDep = function(text, currentDepPath) {
  // Check for relative
  if (text[0] == '.') {
    // Resolve dependency
    // Correct the dependency by removing the current word from the
    // code buffer and insert the resolved dep name instead
    var resolveDepName = resolveDepPath(currentDepPath, text);

    //console.log(mode, currentDepPath, text, resolveDepName);
    return resolveDepName;

    //console.log(resolveDepName);
  }

  // Do nothing to resolve - trust the user?
   return text;
};

/**
 * @method parseCode
 * @param {string} code Tha code to modify and scan for deps
 * @returns {Object} { code:'', deps: [] }
 */
var parseCode = function(currentDep, code, inLibraryCode) {
//console.log(code);
  var validChars = '_.$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  var validCharsLookup = {};
  var t = '';
  var m = '';
  // Create index
  for (var a = 0; a < validChars.length; a++) validCharsLookup[validChars[a]] = a + 1;
  var mode = 'code';
  var lastMode = mode;

  var lastCharMode = mode;
  var charMode = mode;

  var escape = false;
  var lastEscape = false;
  var currentWord = '';
  var append = '';
  var foundDefine = 0;
  var debug = 0;
  var lineNumber = 1;

  // Get the base name
  // XXX: We assume that libraries are written in pure js...
  var currentBasename = path.basename(currentDep, '.js');
  // Cut off the file name
  var currentDepPath = path.join(path.sep, path.dirname(currentDep));
  // Get current dep name
  var currentDepName = path.join(currentDepPath, currentBasename).substring(1);
  // Set the define reference
  var defineReference = '\'' + currentDepName + '\', ';
  // Set the define statement string
  // XXX: This could be different if we have coffee script code the ( ) should
  // be skipped
  var defineStatement = 'Famono.scope(' + defineReference;
  // Init result
  var result = {
    code: '',
    current: currentDepName,
    deps: [],
    globals: []
  };
  // Log words and their mode
  var words = [];

  // Set the warning level
  var ignoreNextWarning = false;
  var ignoreWarnings = false;

  // Helper for printing out warnings
  var warning = function(text) {
    if (ignoreNextWarning || ignoreWarnings) {
      // Be silent
      ignoreNextWarning = false;
    } else {
      console.warn(yellow, 'Famono:', normal, 'Warning:', text, 'at', currentDep + '.js:L'+ lineNumber);
    }

  };

  // This function will return the next couple of chars it'll discard spaces 
  var getNextChars = function(index, count) {
    var charList = '';
    var a = 0;
    // While count is not reached and code length not exeeded add more chars
    while (charList.length < count && (index + a) < code.length) {
      // Get the current char
      var ch = code[index + a];
      // inc a
      a++;
      // Make sure we dont have a space here...
      if (ch !== ' ') charList += ch;
    }
    return charList;
  };

  // Byte parser
  for (var i = 0; i < code.length; i++) {
    // Current char
    var c = code[i];
    // Prev char
    var cp = code[i - 1];
    // Next char
    var cn = code[i + 1];

    // Check previous char
    escape = (cp === '\\') && !lastEscape;
    if (c === '\n') lineNumber++;

    // Mode setters and unsetters
    if (mode !== 'code') {
      if (mode === 'block-comment' && c == '*' && cn == '/') mode = 'code';
      if (mode === 'line-comment' && c == '\n') mode = 'code';
      if (mode === 'double-string' && c == '"' && !escape) mode = 'code';
      if (mode === 'single-string' && c == "'" && !escape) mode = 'code';
      if (mode === 'array' && cp == "]" && !escape) mode = 'code';
    } else {
      if (c == '[' && !escape) mode = 'array';
      if (c == '/' && !escape && cn == '*') mode = 'block-comment';
      if (c == '/' && !escape && cn == '/') mode = 'line-comment';
      if (c == '#') mode = 'line-comment'; // Support for coffeescript comments
      if (c == '"' && !escape) mode = 'double-string';
      if (c == "'" && !escape) mode = 'single-string';
    }

    if (c === '\n') {
      // (debug === 1) && console.log(t);
      // (debug === 1) && console.log(m);
      t = '';
      m = '';
    } else {
      t += c;
      if (escape) {
        m += 'E';
      } else {
        if (!isStringMode(lastMode) && isStringMode(mode)) {
          charMode = lastMode;
        } else {
          charMode = mode;
        }
        m += charMode[0];
      }
    }


    // Check if the char is valid or if in string mode
    // if in comment mode we seperate by words by space and new line
    if (charMode == 'array' || validCharsLookup[c] || isStringMode(charMode) || (isCommentMode(charMode) && c !== ' ' && c !== '\n')) {

      lastCharMode = charMode;
      currentWord += c;

    } else {
      // If we got an actual word we store this
      if (currentWord !== '') {

        words.push({
          mode: lastCharMode,
          text: currentWord,
          end: i,
          newEnd: result.code.length
        });
        // Get the last and current words...
        var greatGrandfather = words[words.length - 4] || {};
        var grandfather = words[words.length - 3] || {};
        var last = words[words.length - 2] || {};
        var current = words[words.length - 1];
        var grandfatherTypeof = (grandfather.mode == 'code' && grandfather.text == 'typeof');

        // if (debug === 2) {
        //   if (last.text === 'require') {
        //     var t = '';
        //     for (var a = 1; a < 10; a++)
        //       t = words[words.length - a].text + ' ' + t;
        //     var m = '';
        //     for (var a = 1; a < 10; a++)
        //       m = words[words.length - a].mode + ' ' + m;
        //     console.log(t);
        //     console.log(m);
        //     console.log(last, current);
        //     console.log('-------');
        //   }
        // }

        // Ok we try something new - we start looking for library globals
        // this is a much cooler way of thinking libraries in js
        if (current.mode === 'code') {

          // Reset found global reference
          var foundGlobalReference = null;

          // Get the next two chars discarding spaces here...
          var nextOperator = getNextChars(i, 2);

          for (var globalIndex = 0; globalIndex < libraryGlobals.length; globalIndex++) {
            // Create a helper for current global
            var currentGlobal = libraryGlobals[globalIndex];
            // So there is actually two ways of dealing with this - we could
            // have an exact match or we could have a relative match
            // further more we actually want the last item in the library
            // registry to overrule previous ones - allowing overwrites
            //
            // Create check for relative global usage
            // XXX: at some point we may have a full library registry to make
            // an exact match only - this way we can make a better error
            // message if dependency is not found.
            var currentCheck = new RegExp('^' + currentGlobal.globalName + '\\.');

            // Check for module name
            var isCurrentModule = new RegExp('^' + currentDepName.split('/')[0] + '.');
            
            // Test if found
            if (current.text === currentGlobal.globalName || currentCheck.test(current.text)) {

              // Test if this is an overwrite in the module it self
              var overwriteInModuleItSelf = isCurrentModule.test(current.text + '.');

              // We check if the next two chars are == or just a single =
              if (nextOperator !== '==' && nextOperator[0] == '=') {
                // I guess we are overwriting a global, but dont warn if in the
                // module definition itself
                // currentDep -> moment/test/moment/zones

                if (!overwriteInModuleItSelf)
                  warning('Global "' + current.text + '" may be overwritten'); //' at ' + currentDep + '.js:L'+ lineNumber);

                // Dont add if we are setting something like a global name like:
                // { famous: foo }
              } else if (nextOperator[0] !== ':') {
                // XXX: We could remember the length of the global name and let
                // the longest win - but in this case we let the last dep in the
                // library registre win.
                foundGlobalReference = {
                  //requireName: currentGlobal.requireName,
                  library: currentGlobal.globalName,
                  dependency: current.text,
                  isChecked: (last.mode === 'code' && last.text === 'typeof'),
                  file: currentDep,
                  lineNumber: lineNumber
                };
              }

            }

          }

          // We only add one reference
          if (foundGlobalReference) {
            // We pass on ignore warning
            if (ignoreNextWarning || ignoreWarnings) {
              // Setting ignoreWarning
              foundGlobalReference.ignoreWarning = true;
              ignoreNextWarning = false;
            }

            // Add the found global
            result.globals.push(foundGlobalReference);
          }

        }

        // Famono annotations...
        if (last.text === '@famono' && isCommentMode(last.mode) && isCommentMode(current.mode)) {
          // We got something looking like // @Famono XXX
          //
          // @Famono ignore
          if (current.text == 'ignore') ignoreNextWarning = true;
          // @Famono silent
          if (current.text == 'silent') ignoreWarnings = true;
        }


        // Find define
        // This is important since some libraries may be simple loaders
        if (grandfather.mode === 'code' && grandfather.text === 'define' && greatGrandfather.text !== 'typeof') {

          if (isStringMode(last.mode) && (current.mode == 'code' || current.mode == 'array') && !inLibraryCode) {
            // Eg.:
            // define('moduleName', [deps], function)
            // define('moduleName', function)
            var moduleName = last.text;
            var deps = [];
            try {
              deps = parseArray((current.mode == 'array') ? current.text : '[]');
            } catch(err) {
              warning('could not parse array "' + current.text + '"');
            }
            
            // Test if app module is already registered
            if (typeof appModuleRegistry[moduleName] == 'undefined') {

              // Add module reference to registry
              appModuleRegistry[moduleName] = {
                deps: deps,
                fileName: currentDep,
                lineNumber: lineNumber,
              };

              // Deps should be added on same level as if in a require statement
              for (var dnr = 0; dnr < deps.length; dnr++) {
                // XXX: We dont support relative paths here or anything too
                // fancy, just plain strings - we strip string encapsulation ''
                var dependecyName = deps[dnr].replace(/'/g, '');

                // This should not hinder stops lazy-loading? Since we are
                // actually resolving stuff only if a module name is given.
                if (dependecyName) result.deps.push(dependecyName);
              }

            } else {
              warning('App module "' + moduleName + '" already defined');
            }
          }

          foundDefine++;
        }

        // Find require()
        if (last.mode === 'code' && (last.text === 'require' || last.text === 'Famono.require') && isStringMode(current.mode) && !grandfatherTypeof) {
          // Get the next two chars discarding spaces here...
          var nextOperator = getNextChars(last.end, 2);
          // Found any : or = then we arent in a require
          var inRequire = true;
          // do a minor check for operators
          for (var a = 0; a < nextOperator.length; a++)
            if (/:|=|\+|\-|\*|\/|%|\||\&/.test(nextOperator[a])) inRequire = false;
          if (inRequire) {          
            // Resolve the dep name
            var resolveDepName = parserResolveDep(current.text, currentDepPath);
            // Push the dependency
            result.deps.push(resolveDepName);
            
            // Update the source code:
            // First char to overwrite
            var newLength = result.code.length - current.text.length;
            // Remove the origibal reference
            result.code = result.code.substring(0, newLength);
            // Add the full reference
            result.code += resolveDepName;
          }

        }

      }
      // Reset the current word
      currentWord = '';
    }

    // add code
    result.code += c + append;
    // Reset append
    append = '';
    // Set carry for last mode
    lastMode = mode;
    // remember the last escape
    lastEscape = escape;

  }

  // if (debug === 3) {
  //   mode = 'code';
  //   text = '';
  //   for (var i = 0; i < words.length; i++) {
  //     var word = words[i];
  //     if (word.mode === mode) {
  //       text += ' ' + word.text;
  //     } else {
  //       console.log(green, mode, normal, text);
  //       mode = word.mode;
  //       text = word.text;
  //     }
  //   }
  // }

  // Add deps...
  var depsString = JSON.stringify(result.deps);

  // If no define is found then wrap the code in a define for consistency
  if (!foundDefine) result.code = 'define(function() {\n' + result.code + '\n});';
  
  // Wrap in Famono scope Credit goes to @speigg for this idea
  result.code = defineStatement + depsString + ', function(require, define) {\n' + result.code + '\n});';

  // Return the result object
  return result;
};

/**
 * @method updateDependencies
 * @param {string} name Dependency name
 * @param {string} repoPath path of the repo
 */
var updateDependencies = function(name, rootPath) {
  // The root path will change the root of the library
  // We use unix root paths and convert them if needed
  rootPath = (rootPath || '').replace(/\//g, path.sep);
  // Set repo path
  var repoPath = path.join(famonoRepoFolder, name, rootPath);
  // Set repo path
  var libPath = path.join(famonoLibFolder, name);
  // Set deps path
  var depsPath = path.join(famonoRepoFolder, '.' + name);
  // Init deps object
  var deps = {};
  // Remove the deps in lib
  removeFolder(libPath);
  // Iterate over the files
  eachFile(repoPath, function(file) {
    if (file.ext === 'js' || file.ext === 'css') {

      // Remove the famonoRepoFolder part from the filenames
      var depName = file.filename.substring(repoPath.length + 1);
      depName = path.join(name, depName);

      // Set empty result
      var result = {};

      // Check if we are handling js or css
      if (file.ext === 'js') {

        // Parse and correct the code
        result = parseCode(depName, fs.readFileSync(file.filename, 'utf8'), true);
        // Set deps relations
        deps[result.current] = result.deps;

      } else {

        // Get the base name
        var currentBasename = path.basename(depName, '.css');
        // Cut off the file name
        var currentDepPath = path.join(path.sep, path.dirname(depName));
        // Get current dep name
        var currentDepName = path.join(currentDepPath, currentBasename).substring(1);

        // Just load the code
        var result = {
          code: fs.readFileSync(file.filename, 'utf8'),
          current: currentDepName
        };
        // Set deps relations
        // Css dont have any relations but we set the deps if not set
        // We could have a situation where only the css file is present so
        // we deal with that. This is a weak set of the deps, they will be
        // overwritten by js deps if found.
        if (!deps[result.current]) deps[result.current] = [];

      }

      // Create the paths
      var filename = path.join(famonoLibFolder, depName);
      var dirname = path.dirname(filename);
      // Store the modifyed code to the famonoLibFolder
      // 1. create the base folder
      //console.log('ensureFolder', dirname);
      ensureFolder(dirname);
      // 2. store code into file
      //console.log('fileName', filename);
      fs.writeFileSync(filename, result.code, 'utf8');

    }

  });

  // okay, so bower packages may have some configuration of the main files
  var bowerJson = path.join(famonoRepoFolder, name, 'bower.json');

  if (fs.existsSync(bowerJson)) {
    var config = lib.loadFromJSON(bowerJson);
    // Make sure we got something and its not index.js already...
    if (config && config.main && config.main !== 'index.js') {
      // So the main could be string or array - we will convert to array first
      var mainFiles = (config.main === ''+config.main)? [config.main]: config.main;
      if (mainFiles.length) {

        var indexDepsLookup = {};
        for (var a = 0; a < mainFiles.length; a++) {
          // Remove any css or js ext, and any ./ at the beginning - its assumed
          var indexDepName = name + '/' + mainFiles[a].replace(/.js|.css/g, '').replace(/^.\//, '');
          if (typeof indexDepsLookup[indexDepName] === 'undefined') {
            indexDepsLookup[indexDepName] = true;
          }
        }


        // Convert lookup into array
        var indexDeps = [];
        for (var key in indexDepsLookup) indexDeps.push(key);

        // Add the dependency to deps
        deps[name + '/index'] = indexDeps;

        var indexJsPath = path.join(libPath, 'index.js');

        // Create the contents
        var indexJs = '// Added by Famono supporting bower configuration\n';
        indexJs += 'Famono.define(\'' + name + '/index' + '\', ' + JSON.stringify(indexDeps) + ', function(require, exports, module) {\n';
        for (var key in indexDepsLookup)
          indexJs += '\trequire(\'' + key + '\');\n';
        indexJs += '});\n';

        // Write the index.js
        fs.writeFileSync(indexJsPath, indexJs, 'utf8');
      
      }
    }
  }

  // Write the package deps
  fs.writeFileSync(depsPath, JSON.stringify(deps, null, '\t'), 'utf8');
};

var removeRepoFolder = function(name, keepRepo) {
  // Make sure we have a name set
  if (!name) return;
  // Set the repo path
  var repoPath = path.join(famonoRepoFolder, name);
  // Set the lib path
  var libPath = path.join(famonoLibFolder, name);
  // Set the deps folder
  var depsPath = path.join(famonoRepoFolder, '.' + name);

  if (!keepRepo) removeFolder(repoPath);
  removeFolder(libPath);
  try {
    fs.unlinkSync(depsPath);
  } catch (err) {
    // Do nothing
  }
};

////////////////////////////////////////////////////////////////////////////////
//
//    WATCH LOCAL LIBRARIES                                                   //
//
////////////////////////////////////////////////////////////////////////////////

// Watcher globals
var watchers = {};
var changedWatchLibraries = {};
var inWatcherReload = false; // If set true it fails on initial load of smart.require

var isWatchSource = function(item) {
  var appFolderExp = new RegExp('^' + process.cwd());
  // if path and not in app folder plus the user havent explicitly turned off
  // watch, then we got a source to watch...
  return (item.path && !appFolderExp.test(item.path) && item.watch !== 'false');
};

var watcherListener = function(libraryName, event, folder, stats) {
//  console.log('Watcher', libraryName, 'Changed');
  // library folder to ensure load order
  var libFolder = path.join(process.cwd(), 'lib');
  // The filename of the smart.require
  var filename = path.join(libFolder, 'smart.require');

  var data = fs.readFileSync(filename, 'utf8');

  if (data[data.length-1] == '\n') {
    data = data.substring(0, data.length-1);
  } else {
    data += '\n';
  }

  inWatcherReload = true;
  // console.log('Watcher reload smart.require');
  // Trigger reload?
  fs.writeFileSync(filename, data, 'utf8');
};

var rigWatchListener = function(libraryName) {
  if (watchers[libraryName]) {
    // Add the listner
    watchers[libraryName].on('all', function(event, path, stats) {
      // Stop other timeouts..
      if (changedWatchLibraries[libraryName]) clearTimeout(changedWatchLibraries[libraryName]);
      // Add this event timeout
      changedWatchLibraries[libraryName] = setTimeout(function() {
        // Remove ref
        changedWatchLibraries[libraryName] = null;
        delete changedWatchLibraries[libraryName];

        // Call the listener
        watcherListener(libraryName, event, path, stats);
      }, 500);

    });
  }
};

var watchFiles = function(config, firstRun) {
  // Start any missing watchers
  for (var key in config) {
    // helper
    var item = config[key];

    // So source is to be watched, just make sure we arent already
    if (isWatchSource(item) && !watchers[key]) {
      console.log(green, 'Famono:', normal, 'Watching files for "' + key + '" in', item.path);
      // Add watcher
      watchers[key] = new chokidar.watch(key, {
        ignored: /[\/\\]\./,
        persistent: true,
        ignoreInitial: true
      });
      // Add the file
      watchers[key].add(item.path);
      // Rig listeners
      rigWatchListener(key);
    }
  }

  // Check if any watchers should be removed
  for (var key in watchers) {
    var item = config[key];
    if (isWatchSource(item)) {
      // Should be ok
    } else {
      // unload
      watchers[key].close();
      // GC
      watchers[key] = null;
      delete watchers[key];
    }
  }

};



///////////////

// Source fetchers
var sourceFetchers = {};

sourceFetchers.path = function(done) {
  var self = this;
  // XXX: TODO

  var sourcePath = self.path;

  var isFile = fs.statSync(self.source).isFile();
  
  // We have to create the folder then
  fs.mkdirSync(self.target); 

  if (isFile) {
  
    console.log(green, 'Famono:', normal, 'Copying file', self.source);
    // XXX: do some error checking...
    try {
      // Read the source code
      var data = fs.readFileSync(self.source, 'utf8');
      // Write the code to the famono repo registry
      fs.writeFileSync(path.join(self.target, 'index.js'), data, 'utf8');
    } catch(err) {
      // Stop and Return the error
      return done('Could not copy the source for "' + self.name + '", Error:' + err.message);
    }
  
  } else {  
  
    console.log('Copy files from', self.source);
  
    eachFile(self.source, function(file) {
      // Cut out the relative path
      var relativePath = file.folder.substring(self.source.length);
      var folder = path.join(self.target, relativePath);
      var fileName = path.join(folder, file.name);

      // Make sure the target folder exists
      ensureFolder(folder);

      // Then copy the file
      try {
        // Read the source code
        var data = fs.readFileSync(file.filename, 'utf8');
        // Write the code to the famono repo registry
        fs.writeFileSync(fileName, data, 'utf8');
      } catch(err) {
        // Stop and Return the error
        return done('Could not copy the source for "' + self.name + '", Error:' + err.message);
      }      
    });  
  }

  removeRepoFolder(self.name, true);  
  // Call when done
  done();
};

// Rig alias
sourceFetchers.alias = function(done) {
  var self = this;
  // We have to create the folder then
  fs.mkdirSync(self.target);  
  // Index file
  var indexFile = path.join(self.target, 'index.js');
  // File dep
  var data = '// This file was auto generated by Famono\ndefine(function(require, exports, module) { module.exports = ' + self.source + '; });';
  // Write the alias
  fs.writeFileSync(indexFile, data, 'utf8');
  // Remove but keep the repo
  removeRepoFolder(self.name, true);  
  // Call when done
  done();
};

sourceFetchers.http = function(done) {
  var self = this;
  var Fiber = Npm.require('fibers');
  var fiber = Fiber.current;

  // Guess we have to download the file...
  console.log(green, 'Famono:', normal, 'downloading "' + self.source + '"');

  http.get(self.source, function(res) {
    var data = '';
    res.on('data', function (chunk) {
      data += chunk.toString();
    });

    res.on('end', function() {
      // We have to create the folder then
      fs.mkdirSync(self.target);

      // Index file
      var indexFile = path.join(self.target, 'index.js');              

      // Write the data
      fs.writeFileSync(indexFile, data, 'utf8');

      // Remove but keep the repo
      removeRepoFolder(self.name, true);

      done();
      fiber.run();
    });

  }).on('error', function(e) {
    done('Error while loading "'+ self.name +'" - ', e.message);
    fiber.run();
  });

  Fiber.yield();
};

// var ensureCounter = 0;
/**
 * @method checkGitFolders
 * @param {Object} config Configuration to match
 * @param {Object} oldConfig Configuration to check up on
 *
 */
var checkGitFolders = function(newConfig, oldConfig) {
  // console.log('inWatcherReload', inWatcherReload, ensureCounter++);
  // Create one united config
  var config = objectMerge(oldConfig, newConfig);
  // Iterate over the deps
  for (var name in config) {
    // Set item helper
    var item = config[name];
    // Set repo path
    var repoPath = path.join(famonoRepoFolder, name);
    // Check if item found in both old and new config
    var foundInBoth = newConfig[name] && oldConfig[name];
    // Was changed test
    var hasChanged = {};
    // Changes
    var changes = 0;
    // Supported source pointers
    var validSources = ['git', 'bower', 'alias', 'http', 'path'];
    // Valid arguments - minus watch since this is handled elsewhere
    var validArguments = ['branch', 'root', 'tag', 'recursive' /* 'watch'*/];
    // The current source type one of validSources
    var sourceType = '';
    // If this souce maybe reloaded
    // XXX: At the moment its not finegrained into libraries KISS
    var sourceReloadAllowed = (inWatcherReload)? isWatchSource(item): !isWatchSource(item);
    // console.log('READY CHECK', name, sourceReloadAllowed);
    // If no reload allowed now skip
    if (!sourceReloadAllowed) continue;

    // Get the source type
    // Initialize check for source changes
    for (var i = 0; i < validSources.length; i++) {
      var val = validSources[i];

      // Main check if config has chaged for source
      hasChanged[val] = foundInBoth && newConfig[name][sourceType] !== oldConfig[name][sourceType];

      // Count changes
      if (hasChanged[val]) changes++;
      
      if (typeof item[val] !== 'undefined') sourceType = val;
    }

    // Valid arguments branch, root, tag
    if (foundInBoth)
      for (var a = 0; a < validArguments.length; a++) {
        var val = validArguments[a];
        hasChanged[val] = (newConfig[name][val] !== oldConfig[name][val]);

        // Count changes
        if (hasChanged[val]) changes++;
      }

    var doneLoading = function(errorMessage) {
      if (errorMessage) {
        console.error(red, 'Famono:', normal, errorMessage);
      } else {
        // Update the deps
        updateDependencies(name, item.root);
        // Make it just a bit more correct when printing out stuff to the user
        if (foundInBoth) {
          console.log(green, 'Famono:', normal, 'Library "' + name + '" was updated via ' + sourceType);
        } else {
          console.log(green, 'Famono:', normal, 'Library created for "' + name + '" via ' + sourceType);
        }
      }
    };

    // Check if sourceType is supported by the sourceFetchers
    if (sourceFetchers[sourceType]) {
      // If sourceType was changed or not found in both
      if (changes || !foundInBoth) {
        // Remove the repo sourceType
        removeRepoFolder(name);

                // Check if the dep is found in the new config
        if (newConfig[name]) {

          // copy from item.sourceType to repoPath...
          sourceFetchers[sourceType].apply({
            name: name,
            source: item[sourceType],
            target: repoPath
          }, [doneLoading]);

        } else {
          console.log(green, 'Famono:', normal, 'remove dep "' + name + '" ' + repoPath);          
        }
      } else {
        console.log(green, 'Famono:', normal, 'The ' + sourceType + ' for "' + name + '" is up-to-date');
      }

    // XXX: TODO Refactor git and bower into sourceFetchers...
    } else if (item.git || item.bower) {

      // Check if the git or bower has changed
      if (hasChanged.git || hasChanged.bower) {
        // The repo has changed - so remove the repo folder
        console.log(green, 'Famono:', normal, 'The new repo has changed for "' + name + '"', repoPath);
        // Remove the repo path
        removeRepoFolder(name);
      }
      // Check if the repo is found
      if (fs.existsSync(repoPath)) {
        // Check if the dep is found in the new config
        if (newConfig[name]) {

          // Do a git update
          // XXX: We dont update the repo - if users wants this, they should
          // set tag/branch etc.
          //
          var result = exec('git pull', { cwd: repoPath });
          if (result.status == 0) {
            if (result.stdout !== 'Already up-to-date.\n') {
              console.log(green, 'Famono:', normal, 'updating dependencies "' + name + '" ');
              updateDependencies(name, item.root);
            } else {
              console.log(green, 'Famono:', normal, 'git update "' + name + '" is up-to-date');
            }

            // Remove but keep the repo
            removeRepoFolder(name, true);
            // Update the deps
            updateDependencies(name, item.root);

          } else {
            console.log(green, 'Famono:', normal, 'git update "' + name + '" ' + repoPath, ' Error!!');
          }
          //console.log(name, status);
        } else {
          // Its not in the new repo so we remove it...
          console.log(green, 'Famono:', normal, 'remove dep "' + name + '" ' + repoPath);
          removeRepoFolder(name);
        }

      } else {
        // So the repo is not found then check if its in the new config
        if (newConfig[name]) {

          // XXX: extract this function and have name and item be passed in
          // as arguments
          var fetchFromGithub = function() {
            // We have to create the folder then
            fs.mkdirSync(repoPath);

            // Guess so then clone the repo to the repo folder
            console.log(green, 'Famono:', normal, 'downloading "' + item.git + '"');
            // Set git params
            var gitParams = [];
            // Set the base command
            gitParams.push('git clone');
            // Set the git reference
            gitParams.push(item.git);
            // Set the target path
            gitParams.push('"' + repoPath + '"');
            // We dive into submodules
            if (item.recursive !== false) gitParams.push('--recursive');
            // Set the branch but make sure that the user havent set tag already
            // tags overrule the branch in Famono...
            if (item.branch && !item.tag) gitParams.push('--branch ' + item.branch);
            // Set the branch
            if (item.tag) gitParams.push('--branch tags/' + item.tag);

            // Clone the repo
            var result = exec(gitParams.join(' '));
            // Check if we have exited correctly
            if (result.status !== 0) {
              // Remove the folder
              removeRepoFolder(name);
              // Throw an error
              throw new Error('Famono: Error could not clone "' + name + '" ' + item.git + ': ' + result.stderr);
            } else {
              console.log(green, 'Famono:', normal, 'Scan the folder and create a dependency file for the repo');

              updateDependencies(name, item.root);
            }
          }; // EO fetchFromGitHub

          if (item.git) {
            // Normal procedure
            fetchFromGithub();
          } else if (item.bower) {
            // Ok we have to fetch the git repo path from the bower db...


            console.log(green, 'Famono:', normal, 'Looking up "' + item.bower + '" in Bower database');
            // Lookup the namespace in the bower db
            // could we do this sync?
            var Fiber = Npm.require('fibers');
            var fiber = Fiber.current;

            lib.getBowerData(item.bower, function(err, result) {

              if (err) {
                console.error(red, 'Famono:', normal, 'Could not resolve namespace "' + name + '" in Bower database, "' + item.bower + '" not found');
              } else {
                // Add the package
                item.git = result.url;
                // This should work eh?
                fetchFromGithub();
              }
              fiber.run();
            });
            Fiber.yield();


          }

        }
      }
    } else {
      console.error(red, 'Famono:', green, 'Could not find repo for "' + name + '", please set "' + validSources.join('"/"') + '"');
    }
  }

  // Reset we just got out of reload
  // console.log('inWatcherReload set FALSE');
  inWatcherReload = false;
};

// This is an important piece of the global dependencies since this converts
// the path to a js variable name
var convertRequireToGlobalName = function(requireName) {
  // requireName.replace(/\/|-/g, '.');
  var result = '';
  for (var i = 0; i < requireName.length; i++) {
    // Current char helper
    var c = requireName[i];
    // Last char helper
    var l = requireName[i-1];

    // Check for slashes
    if (c == '/') {
      // Convert slash to dot
      result += '.';
    } else if (c !== '-') {
      // We skip "-" but add the rest with the twist of camelcasing the letter
      // following a "-" eg. famous-polyfill -> famousPolyfill
      result += (l == '-') ? c.toUpperCase() : c;
    }
  }

  return result;
};

var firstRunInitWatchers = true;

var ensureDependencies = function(compileStep) {
  // We only want to deal with one require file at this moment... and it has to
  // be located in the lib folder.
  if (compileStep.inputPath !== 'lib/smart.require')
    return;
  // Read in the require files
  var requireFile = compileStep.read().toString('utf8');
  var lastRequireFile = (fs.existsSync(configFolder)) ? fs.readFileSync(configFolder, 'utf8') : '{}';

  // Check the version and the versionFile to see if we have changed api
  // and need to recreate libs etc.
  var lastVersion = (fs.existsSync(versionFile)) ? fs.readFileSync(versionFile, 'utf8') : '';

  var newConfig, oldConfig;

  try {
    newConfig = JSON.parse(requireFile);
  } catch (err) {
    console.error(red, 'Famono:', normal, 'You have an error in your "lib/smart.require"');
    console.log(red, 'Error:', normal, err.message);
    throw new Error('Famono: could not parse "lib/smart.require"');
  }

  // We only want to handle if the config has actually changed
  if (lastRequireFile !== requireFile || lastVersion !== version) {


    try {
      oldConfig = JSON.parse(lastRequireFile);
    } catch (err) {
      // We reset if theres an error on the old config...
      // XXX: we should clean out the folder
      oldConfig = {};
    }

    // console.log('CHECK REPO FOLDER');
    // Make sure the repo is up to date
    checkGitFolders(newConfig, oldConfig);
    // Update the last config
    fs.writeFileSync(configFolder, requireFile, 'utf8');
    // Update the version file
    fs.writeFileSync(versionFile, version, 'utf8');
    // Trigger watch refresh
    watchFiles(newConfig);
  } else {
    // console.log('CONFIG NOT CHANGED');
    if (firstRunInitWatchers) {
      firstRunInitWatchers = false;
      // Trigger watch refresh
      watchFiles(newConfig, true);
    }
  }

  libraryRegistry = newConfig;
  libraryGlobals = [];

  // XXX: Library globals should be in a finegrained preparsed library registry
  for (var key in libraryRegistry) {
    // convert / or - into dot seperator
    var newKey = convertRequireToGlobalName(key); // key.replace(/\/|-/g, '.');
    // Set the globals
    //libraryGlobals.push({ globalName: newKey, requireName: key });
    libraryGlobals.push({ globalName: newKey });
  }

};

// Iterate through the packages used by the application
// that are defined in the .meteor/packages file.
// Essentially project.getPackages https://github.com/meteor/meteor/blob/64e02f2f56d1588d9daad09634d579eb61bf91ab/tools/project.js#L41
var eachPackage = function(appDir, callback) {
  var ret = [];

  var file = path.join(appDir, '.meteor', 'packages');

  var raw = fs.readFileSync(file, 'utf8');
  var lines = raw.split(/\r*\n\r*/);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^#/.test(line)) {
      // Noop we got a comment
    } else if (line.length && line !== ' ') {
      var folder = path.join(appDir, 'packages', line);
      // Check if the package is in the packages folder
      if (fs.existsSync(folder)) {
        if (callback) {
          callback({
            name: line,
            folder: folder
          });
        }
      }
    }
  }

  return ret;
};

// Read the package.js file to find the client files of packages that depend on famono.
var readPackagejs = function(packagejsSource) {

  var empty = function() {
  };

  // Create our own Package api
  var PackageApi = function(ret) {

    var use = function(names, where) {
      // Check this is depended on the client.
      if (where && typeof where != 'object' && where !== 'client' && where.indexOf('client') < 0) return;

      // Check famono is depended on.
      // Parse the package names into a checkable string ex. /session/ejson/
      names = '/' + ((names === '' + names) ? names : names.join('/')) + '/';

      if (/\/famono\//.test(names)) {
        ret.useFamono = true;
      }
    };

    var addFiles = function(paths, where, fileOptions) {

      // Ignore asset files.
      if (fileOptions && fileOptions.isAsset) return;

      // Only add client files.
      if (where && where !== 'client' && where.indexOf('client') < 0) return;

      // Ensure paths is an array
      paths = (paths === '' + paths) ? [paths] : paths;

      paths.forEach(function(relativePath) {
        ret.clientFiles.push(relativePath);
      });
    };

    return {
      describe: empty,
      on_test: empty,
      on_use: function(f) {
        f({
          use: use,
          imply: use,
          add_files: addFiles,
          export: empty
        });
      },
      _transitional_registerBuildPlugin: empty
    };
  };

  // Create an empty Npm api
  var NpmApi = function() {
    return {
      depends: empty,
      require: Npm.require
    };
  };

  var packageReaderStart = 'return function (package, npm) {' +
    'var ret = { clientFiles: [], useFamono: false };' +
    'var Package = package(ret);' +
    'var Npm = npm();';

  // body will be the package.js file

  var packageReaderEnd = 'return ret; };';

  var reader = new Function(packageReaderStart + '\n' + packagejsSource + packageReaderEnd)();
  return reader(PackageApi, NpmApi);
};

// Return all the files from packages that depend on famono.
var dependentPackageFiles = function(appDir) {
  var dependentClientFiles = [];

  eachPackage(appDir, function(packag) {
    if (packag.name === 'famono') return;

    var packagejs = path.join(packag.folder, 'package.js');

    // Ignore folders that are missing a package.js.
    if (!fs.existsSync(packagejs)) return;

    // Read the package.js file.
    packagejs = fs.readFileSync(packagejs, 'utf8');

    try {
      var results = readPackagejs(packagejs);

      // Make sure the package depends on famono.
      if (results.useFamono) {

        // Return all the package's client files.
        results.clientFiles.forEach(function(relativeClientFile) {
          var folder = packag.folder + '/' + relativeClientFile;
          folder = path.dirname(folder);
          var file = relativeClientFile.substring(relativeClientFile.lastIndexOf('/') + 1);

          dependentClientFiles.push(fileProperties(folder, file));
        });
      }
    } catch (e) {
      console.error(red, 'Famono:', normal, 'problem reading package.js for "' + packag.name + '" package.', e);
    }
  });

  return dependentClientFiles;
};

// Scan a source file for require statements and store them on sourceDeps.
var storeFileDependencies = function(file, sourceDeps, globalDeps) {

  // Only scan javascript and coffeescript files
  // that are not prefixed dotted.
  if (/^js$|^coffee$|^litcoffee$|^coffee.md$/.test(file.ext) && !file.isDotted) {

    // Load the code
    var code = fs.readFileSync(file.filename, 'utf8');

    // Calculate the depName - in this case its the filename without extension
    var depNameLength = file.filename.length - file.ext.length - 1;

    // Dependency name
    var depName = file.filename.substring(0, depNameLength);

    // Parse the file
    var result = parseCode(depName, code);
    // Store the source dependencies
    sourceDeps[depName] = result.deps;

    // Store the global dependencies
    globalDeps[depName] = result.globals;
  }
};

// Scan the application's source code for requirejs dependencies.
var sourceCodeDependencies = function() {
  // Source deps
  var sourceDeps = {};

  // Global deps
  var globalDeps = {};

  // Get the app directory
  var appDir = process.cwd();

  // Check the application's client source code for dependencies.
  // We assume famous is included in .meteor/packages because
  // the plugin is run off of lib/smart.require (in the application).

  // Ignore public, private, server, packages
  // client/compatibility is scanned for dependencies as normal code
  // path.join(appDir, 'client', 'compatibility')
  var ignoreFolders = [path.join(appDir, 'public'), path.join(appDir, 'private'),
    path.join(appDir, 'server'), path.join(appDir, 'packages'), path.join(appDir, 'tests')];

  // Scan the source files to find the dependency list
  eachFile(appDir, function(file) {
    storeFileDependencies(file, sourceDeps, globalDeps);
  }, null, null, null, ignoreFolders);

  // If any packages depend on famono scan their source code.
  var packageFiles = dependentPackageFiles(appDir);
  packageFiles.forEach(function(file) {
    storeFileDependencies(file, sourceDeps, globalDeps);
  });

  return {
    sourceDeps: sourceDeps,
    globalDeps: globalDeps
  };
};

/////////////////////////////////////////////////////////
// LIBRARY GLOBALS //////////////////////////////////////
/////////////////////////////////////////////////////////


/////// Get the specific library dependency registry
var libraries = {};

var getLibrary = function(libraryName) {
  if (typeof libraries[libraryName] === 'undefined') {
    var filename = path.join(famonoRepoFolder, '.' + libraryName);
    try {
      libraries[libraryName] = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch (err) {
      namespaceError(libraryName, filename);
    }
  }

  return libraries[libraryName];
};

var DependencyLoad = function(depRequireName, depGlobalName) {
  var self = this;
  self.requireName = depRequireName;
  self.globalName = depGlobalName;
};

// Library globals tree
var libraryGlobalRoot = {};

// Library globals to load
var libraryGlobalsToLoad = [];

var addLibraryGlobalDependency = function(libraryName, depRequireName) {
  // So we simply create the global tree, we only get the dependency in the
  // require naming format
  //
  // The strategy is really simple, we check if its already set if so then dont
  // do anything
  // If not then set the global and call addLibraryGlobalDependency on all its
  // dependencies - pretty basic eh?

  // Get the global name
  var depGlobalName = convertRequireToGlobalName(depRequireName);
  // Parse the dep name into parts for us to check
  var parts = depGlobalName.split('.');

  // Global var pointer, it points at root and digs deeper as we proceed
  var globalPointer = libraryGlobalRoot;

  // Great now we have a list of names to test...
  for (var i = 0; i < parts.length; i++) {

    // Current name
    var currentName = parts[i];

    // Check if this level i global name exists, if not then create
    if (typeof globalPointer[currentName] === 'undefined') {

      // If this is the last item we set the dependency otherwice create an
      // object
      if (i == parts.length-1) {
        // Set the ending require reference - should we set this differently
        // eg. if we would allow for overwrites and extends? At the moment
        // it would overwrite - but we could have cases where we set some vars
        // but also want n x dep extendsions. Question would be: How to tell the
        // difference between the expected library behaviour.
        // We could have a reference like { extends: {}, container: {} } but
        // this would again complicate things, right?
        // /famous would imply all inclusive eg. /famous/core etc.
        //
        // Set the ending require reference
        // XXX: We commented this out since this is performed by the globals to
        // load instead - this could change depending on the dependency, eg. if
        // the dep is not a define but a function/variable/object that we
        // simply insert directly - it would be the cleanest dependency
        // definition possible?
        // globalPointer[currentName] = depRequireName;

        // So we have to call addLibraryGlobalDependency for each dependency
        // of this dependency to make sure they are added!

        // Get the library descriptor for the library
        var descriptor = getLibrary(libraryName);

        // Get the dependency array
        var deps = descriptor[depRequireName];

        if (deps) {

          // Add each dependency in array
          for (var a = 0; a < deps.length; a++) {
            // Add the library global dependency...
            addLibraryGlobalDependency(libraryName, deps[a]);
          }

        } // Else we could be loading a root dependency...

        // We load the dependency via require statements for starters
        // XXX: This will change in the future to be directly injected functions
        // or raw "defines"
        // eg. famous.core.Surface = (function() { dep })(scope);
        // It will be the require() functions job (if used for lazyloading) to
        // check globals first if not found then load dependencies.
        libraryGlobalsToLoad.push({ requireName: depRequireName, globalName: depGlobalName });
        globalPointer[currentName] = new DependencyLoad(depRequireName, depGlobalName);
      } else {
        // Set an object ready for nested globals
        globalPointer[currentName] = {};
      }

    }

    // Dig deeper
    globalPointer = globalPointer[currentName];
  }

};

// Find the matching dependencies for globals
var loadGlobalDependenciesRegisters = function(globalDeps, libraries) {
  var result = {};
  var dotResolveWarning = {};

  for (var fileName in globalDeps) {
    // Create helper for the file object
    var file = globalDeps[fileName];

  // console.log('FILE:', fileName, file);

    for (var i = 0; i < file.length; i++) {
      // Create dependency reference
      var dep = file[i];

      // Get the needle eg. "famous.core.Surface"
      var needle = dep.dependency;
      // Get the library descriptor an object eg.
      // {
      // "famous/core/ElementAllocator": [],
      // "famous/core/Engine": [
      //   "famous/core/Context",
      //   "famous/core/EventHandler",
      //   "famous/core/OptionsManager"
      // ]
      // }
      // Note: at the moment its using slash as seperator, but in the future
      // this could change to the dot annotation - but for now we keep compliant
      // with requireJS etc.
      //
      var haystack = getLibrary(dep.library);
      var haystackDot = {};

      for (var key in haystack) {
        var dependencies = haystack[key];
        // We are going to rewrite the dependencies to dot notation.
        // This is not trivial and will have some limitations:
        //
        // "test/dot-file.js" -> "test.dot.file.js"?
        // "test/dot.file.js" -> "test.dot.file.js"
        // "test/dot/file.js" -> "test.dot.file.js"
        // "test.dot.file.js" -> "test.dot.file.js"
        // So file references could be messed up just a bit - but we can warn
        // the user? we do this via dotResolveWarning
        var dotKey = key.replace(/\/|\-/g, '.');
        if (typeof haystackDot[dotKey] !== 'undefined') {
          haystackDot[dotKey].keys.push(key);
        } else {
          haystackDot[dotKey] = {
            keys: [key],
            deps: dependencies
          };
        }
      }
      // Hmmm, okay so now we got the needle = dep.dependency and the
      // haystack = library
      
      // So the fastest strategy for solving this problem would be to split into
      // a list then join using slash and keep popping an item retrying until
      // nothings left - if so then throw a warning...

      // We have to remove the dep.library from the first part of the needle
      // then have the rest split up if any left
      // we then shift the dep.library on the needleList supporting stuff like
      // famous.polyfills.index
      // |- dep.library -| rest |
      // Create the needle list

      var needleList = [needle];

      // Support direct top level references
      if (needle !== dep.library) {

        // Remove the library name from the needle
        var restOfNeedle = needle.substring(dep.library.length + 1);

        // Split the rest up by dots
        needleList = restOfNeedle.split('.');

        // Add the library name back on to the array
        needleList.unshift(dep.library);
      }

      // We just add the odd case of index files
      needleList.push('index');

      // The found dep...
      var found = false;

      // Iterate over the name until its found or not
      while (!found && haystackDot && needleList.length) {

        // Get the coresponding requireJS dep name at this search level
        var current = needleList.join('.');
        // console.log('GOT:', current);

        // If we got the needle then return found
        if (haystackDot[current]) {
          found = haystackDot[current].keys[0];
          if (haystackDot[current].keys.length > 1) {
            // Add a warning
            dotResolveWarning[current] = found;
          }
          // found = current;
        }

        // Loose the last item eg. famous/core/Surface -> famous/core
        needleList.pop();
      }

      if (found) {
        // console.log('FOUND:', needle, '->', found);

        // Add the library global dependency
        addLibraryGlobalDependency(dep.library, found);
        // We should have an easy way of simply adding the dependency in a
        // depencency tree for creating the global object loader
        // We should create a json.stringify that addds the require statements
        // in the future it would be the code it self being added directly...
      } else {
        if (dep.isChecked || dep.ignoreWarning) {
          // This dep is actually just being checked so we dont care about this
          // too much. It could be some code testing for a library scope in this
          // case we try to resolve but dont throw an error if not resolved.
        } else if (typeof needle === 'undefined') {
          // This is kindof an odd case, but if it happens we wont go complaining
          // about it since the user can't really do much about it?
        } else {
          console.warn(yellow, 'Famono:', normal, 'Warning, could not find the global reference "' + needle + '" in "' + dep.file + '.js":L' + dep.lineNumber);
        }
      }

    }

  }

  // Print out warnings
  for (var key in dotResolveWarning) {
    console.warn(yellow, 'Famono:', normal, 'Dot notation warning, multiple references for "' + key + '"" using: ' + dotResolveWarning[key]);
  }

  return result;
};

var prettyIndent = function(i) {
  var indent = '';
  for (var a = 0; a < i; a++) {
    indent += '  ';
  }
  return indent;
};

// Converts any object with functions etc. into a text code block
var comleteTextify = function(obj, level, pretty) {
  // XXX: We should create our own stringify for this - but currently this works
  // for "define" cases - not direct dependencies
  var result = '';
  if (!level) level = 0;

  var keys = Object.keys(obj);

  for (var a = 0; a < keys.length; a++) {
    var key = keys[a];
    var val = obj[key];

    // XXX: Skip the dependency load printout
    if (val instanceof DependencyLoad) continue;

    // Add pretty indent
    if (pretty) result += prettyIndent(level);

    if (pretty) {
      result += key + ((level) ? ': ': ' = ');
    } else {
      result += key + ((level) ? ':': '=');
    }

    if (val instanceof DependencyLoad) {
      result += 'Famono.require(\'' + val.requireName + '\')';
    } else if (val === ''+val) {
      // String
      result += "'" + val + "'";
    } else if (val === +val) {
      // Number
      result += ''+val;
    } else if (val === null) {
      // null
      result += 'null';
    } else if (typeof val === 'function') {
      // function
      result += val.toString();
    } else if (typeof val === 'undefined') {
      // undefined
      result += 'undefined';
    } else if (Array.isArray(val)) {
      // array
      result += '[';
      // When pretty printing we add lines
      if (pretty) result += '\n';
      for (var i = 0; i < val.length; i++) {
        // Get the text pr. item
        result += comleteTextify(val[i], level+1, pretty) + ((i == val.length-1) ? '':',');
      }
      // Add pretty indent
      if (pretty) result += prettyIndent(level);      
      result += ']';
    } else if (typeof val === 'object') {
      // Got an object
      result += '{';
      // When pretty printing we add lines
      if (pretty) result += '\n';
      result += comleteTextify(val, level+1, pretty);
      // Add pretty indent
      if (pretty) result += prettyIndent(level);      
      result += '}';
    } else {
      throw new Error('Error parsing type');
    }

    if (a < keys.length-1) result += ',';

    // When pretty printing we add lines
    if (pretty) result += '\n';
  }

  return result + ((level == 0 && result.length)? ';\n':'');
};

// This function is run after all deps are resolved and will generate the code
// initialising the global objects dependencies
var convertGlobalDependenciesIntoString = function() {
  // libraryGlobalRoot are the ones we work on, we
  // return a string
  // We simply stringify the library
  var result = comleteTextify(libraryGlobalRoot, 0, false);
  for (var i = 0; i < libraryGlobalsToLoad.length; i++) {
    var lib = libraryGlobalsToLoad[i];
    result += '\n' + lib.globalName + ' = Famono.require(\'' + lib.requireName + '\');';
  }
  return result;
};

/////////////////////////////////////////////////////////
// END OF LIBRARY GLOBALS ///////////////////////////////
/////////////////////////////////////////////////////////

var getDepRoot = function(depName, last) {
  var list = depName.split('/');
  var index = (last) ? list.length - 1 : 0;
  return list[index];
};

var eachSourceDeps = function(sourceDeps, f) {
  // Iterate over the files
  for (var file in sourceDeps) {
    // Get the deps in the file
    var deps = sourceDeps[file];
    // Iterate over each dep in file
    for (var i = 0; i < deps.length; i++) {
      // Get the dep name
      var depName = deps[i];
      f({
        filename: file,
        name: depName,
        root: getDepRoot(depName)
      });
    }
  }
};

var loadRequireDependenciesRegisters = function(sourceDeps, libraries) {
  var result = {};

  eachSourceDeps(sourceDeps, function(dep) {
    result[dep.root] = getLibrary(dep.root);

  });

  return result;
};


var neededDeps = {};
var neededDepsIndex = 0;
var loadDepsList = [];

var resolveDependencies = function(filename, wanted, libraryDeps, level) {
  level = level || 0;
  // We check wanted
  // wanted = ['dep1', 'dep2']
  for (var i = 0; i < wanted.length; i++) {
    var name = wanted[i];

    if (typeof neededDeps[name] === 'undefined') {
      // Get the lib root
      var root = getDepRoot(name);
      var suffix = getDepRoot(name, true);

      // XXX: Improve this check - at the moment we assume that the name is
      // eg. "famous" but we could have sub repos like "famous/core" so at the
      // moment we would check for "famous" and it would fail if we define
      // sub libraries in the library registry... So this would trigger failure
      // Note: we should check that folder creation still works if subfoldered
      // library names are used.
      if (libraryDeps[root]) {

        // Check if we are actually pointing to a folder? if it contains an
        // index file then use that instead
        if (libraryDeps[root][name + '/index']) {
          name += '/index';
        } else if (libraryDeps[root][name + '/' + suffix]) {
          name += '/' + suffix;
        }


        // Still make sure the library is found
        if (libraryDeps[root][name]) {

          // Get the nested deps
          var nextWanted = libraryDeps[root][name];
          // Add the dep and resolve its deps
          neededDeps[name] = level;
          // Resolve the deps
          resolveDependencies(filename, nextWanted, libraryDeps, level + 1);
          // Add the deps to the load list
          loadDepsList.push({
            name: name,
            level: level,
            index: neededDepsIndex++,
            deps: nextWanted.length
          });

        } else {
          // Add the deps to the load list - Note, we cant find it - but
          // we dont want to upset the client because of our limitations
          // it could be that the code uses eg. require('name' + foo); this
          // cannot be resolved by us - the client may know more than we...
          loadDepsList.push({
            name: name,
            level: level,
            index: neededDepsIndex++,
            deps: 0
          });
          // And we warn about an error...
          libraryError(name, libraryDeps[root], filename);
        }

      } else {
        namespaceError(root, filename);
      }
    }

  }
};


// Make sure the system is rigged
installationCheck();
// XXX:
// We should perhaps also update the repos if we are running on latests version
// in the library registry

Plugin.registerSourceHandler("require", function(compileStep) {
  compileStep.rootOutputPath = '/lib/';
  // We only care about generating client-side code...
  // XXX: at the moment, but it would be nice if we could get arcs etc. maybe
  // a "cordova" set so we could adapt the library code depending on the target
  if (compileStep.arch !== 'browser' && compileStep.arch !== 'web.browser')
    return;

  console.log('\nEnsure dependencies...');

  // Reset globals
  libraryGlobalRoot = {};
  libraryGlobalsToLoad = [];
  appModuleRegistry = {};

  // Reset deps list
  neededDeps = {};
  neededDepsIndex = 0;
  loadDepsList = [];

  // We check if the config has changes and load / unload dependencies
  // accordingly
  ensureDependencies(compileStep);

  // Scan the user code for require statements.
  var dependencies = sourceCodeDependencies();
  // Get the source require deps
  var sourceDeps = dependencies.sourceDeps;
  // Get the source global deps
  var globalDeps = dependencies.globalDeps;

  // Load libraries registers
  var libraryRequireDeps = loadRequireDependenciesRegisters(sourceDeps);

  var libraryGlobalsDeps = loadGlobalDependenciesRegisters(globalDeps);

  // Load needed deps list
  for (var file in sourceDeps) {
    // Get the deps pr. file
    var deps = sourceDeps[file];
    // Resolve the files
    resolveDependencies(file, deps, libraryRequireDeps);
  }

  // Check if we have namespace errors, we try to resolve these by looking them
  // up in the bower db
  var missingNamespaces = Object.keys(namespaceErrors).length;

  if (missingNamespaces) {

    // Checkcounter is request returned counter
    var checkCounter = 0;

    // Object over the namespaces / libraries to add in the config
    var namespacesToAdd = {};

    // Iterate over the namespaces we could not find
    for (var namespace in namespaceErrors) {

      // Check if namespace is loaded / library installed or not
      if (libraryRequireDeps[namespace]) {
        // We already have the namespace - no need to look it up in the bower db
        //if (++checkCounter == missingNamespaces) lib.setConfigObject(namespacesToAdd);

      } else {

        if (namespace == 'famous-polyfills' || namespace == 'famousPolyfills') {
          console.warn(yellow, 'Famono:', normal, 'DEPRECATED: namespace "' + namespace + '" use "famous.polyfills" in "' + file + '"');

        } else {
          console.warn(yellow, 'Famono:', normal, 'Could not resolve namespace "' + namespace + '" in "' + file + '"');
        }
        // // Lookup the namespace in the bower db
        // lib.getBowerData(namespace, function(err, result) {

        //   if (err) {
        //     console.log(green, 'Famono:', normal, 'Could not resolve namespace "' + namespace + '" in Bower database');
        //   } else {
        //     // Add the package
        //     namespacesToAdd[result.name] = result.url;
        //   }

        //   // We are doing this async - and want to check that all requests have
        //   // returned
        //   if (++checkCounter == missingNamespaces) lib.setConfigObject(namespacesToAdd);

        // });

      }

    }

  } // EO missing namespaces

//console.log(libraryGlobalRoot);
//console.log(convertGlobalDependenciesIntoString());

  // Add the "globals to load" to the require loader
  for (var i = 0; i < libraryGlobalsToLoad.length; i++) {
    loadDepsList.push({ name: libraryGlobalsToLoad[i].requireName });
  }

  //##### Add dependency library code to the bundle ######

  // Make sure we only serve the dependencies once...
  var isShipped = {};
  // Count the defines
  var sumOfDefines = 0;

  // Add the library javascript
  for (var i = 0; i < loadDepsList.length; i++) {
    var dep = loadDepsList[i];
    
    // Remove the trailing /index
    dep.name = dep.name.replace(/\/index$/, '');

    if (!isShipped[dep.name]) {
      // Make sure we only serve things once
      isShipped[dep.name] = true;
      // Inc counter
      sumOfDefines++;

      // ADD JS
      var filenameJS = path.join(famonoLibFolder, dep.name + '.js');
      var filenameIndexJS = path.join(famonoLibFolder, dep.name, 'index.js');
      // ADD CSS
      var filenameCSS = path.join(famonoLibFolder, dep.name + '.css');
      // ADD HTML
      var filenameHTML = path.join(famonoLibFolder, dep.name + '.html');

      var foundJS = fs.existsSync(filenameJS);
      var foundIndexJS = fs.existsSync(filenameIndexJS);
      var foundCSS = fs.existsSync(filenameCSS);
      var foundHTML = fs.existsSync(filenameHTML);

      // I guess we are pointing at a folder since we got an index.js file we
      // use this instead...
      if (!foundJS && foundIndexJS) {
        foundJS = foundIndexJS;
        filenameJS = filenameIndexJS;
      }


      // Check if the resource is found
      if (foundJS) {

        compileStep.addJavaScript({
          path: 'lib/' + dep.name + '.js',
          sourcePath: 'lib/' + dep.name + '.js',//filenameJS,
          data: fs.readFileSync(filenameJS, 'utf8'),
          bare: true
        });

      } else {
        if (foundCSS || foundHTML) {

          // Add definition - we prop. only got a css file or something
          compileStep.addJavaScript({
            path: 'lib/' + dep.name + '.js',
            sourcePath: 'lib/' + dep.name + '.js',//filenameJS,
            data: '// This file was autogenerated by Famono\nFamono.scope(\'' + dep.name + '\', [], function(require, define) {\n  define(function(){});\n});',
            bare: true
          });

        } else {
          // Warn again that reference not found?
          // Add definition - we prop. only got a css file or something
          compileStep.addJavaScript({
            path: 'lib/' + dep.name + '.js',
            sourcePath: 'lib/' + dep.name + '.js',//filenameJS,
            // XXX: Should we actually throw an error instead of a console warning?
            // The user is clearly doing something wrong.
            data: '// This file was autogenerated by Famono\nFamono.scope(\'' + dep.name + '\', [], function(require, define) {\n  define(function() { \n    console.warn(\'Famono: Warning, could not find "' + dep.name + '"\');\n  });\n});',
            bare: true
          });          
        }

      }

      // Check if the resource is found
      if (foundCSS) {

        compileStep.addStylesheet({
          path: 'lib/' + dep.name + '.css',
          data: fs.readFileSync(filenameCSS, 'utf8'),
          //sourceMap:
        });

      }

      // Check if the resource is found
      if (foundHTML) {

        // XXX: Figure out how to add html
        //
        // compileStep.addStylesheet({
        //   path: 'lib/' + dep.name + '.css',
        //   data: fs.readFileSync(filenameCSS, 'utf8'),
        //   //sourceMap:
        // });

      }

    }


  }

  // Add the global object to the bundle - this is after all dependencies should
  // be ready in code
  compileStep.addJavaScript({
    path: 'lib/global-definitions.js',
    sourcePath: 'lib/global-definitions.js',
    // We add the textified global dependency declaration
    data: convertGlobalDependenciesIntoString(),
    bare: true
  });

  // We set the count of defines and check load
  //compileStep.appendDocument({ section: "body", data: '<script>\n  define(' + sumOfDefines + ');\n</script>\n' });

// console.log(loadDepsList);

});
