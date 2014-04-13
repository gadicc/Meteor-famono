
var fs = Npm.require('fs');
var path = Npm.require('path');
var exec = Npm.require('sync-exec');

var green = '\u001b[32m';
var gray = '\u001b[2m';
var white = '\u001b[1m';
var normal = '\u001b[0m';

// Set the main famono folder for our work...
var famonoRepoFolder = path.join(process.cwd(), '.meteor', '.famono-repos');
// Make sure famonoRepoFolder exists
if (!fs.existsSync(famonoRepoFolder)) fs.mkdirSync(famonoRepoFolder);

// Make sure we can work here...
if (!fs.existsSync(famonoRepoFolder))
  throw new Error('Famono cannot create any files - make sure you have the necessary rights to the filesystem');

var configFolder = path.join(famonoRepoFolder, '.config');
var famonoLibFolder = path.join(famonoRepoFolder, 'lib');

// Make sure famonoLibFolder exists
if (!fs.existsSync(famonoLibFolder)) fs.mkdirSync(famonoLibFolder);

/**
 * @method eachFile
 * @param {Function} f callback(filename, name, level, index)
 * @returns {Array} list of javascript filenames in the bundle
 */
var eachFile = function(folder, f, dotted, level) {
  var fileList = fs.readdirSync(folder);
  // Make sure we have a proper level
  level = level || 0;

  for (var i = 0; i < fileList.length; i++) {
    // Keep nice reference to the filename
    var name = fileList[i];
    // Split the file name by '.'
    var sn = name.split('.');
    // Get the full filename
    var filename = path.join(folder, name);
    // Set dotted
    var isDotted = (sn[0] === '');
    // Get the file stats
    var stats = fs.statSync(filename);
    // Show this dotted, if dotted is true we dig into dotted folders
    var showDotted = (dotted === true && isDotted) || (!isDotted);
    // We only iterate over non-dotted javascript files - this should be
    // recursive, avoiding private, public and server folders
    if (stats.isFile())
      f({
        folder: folder,
        filename: filename,
        name: name,
        level: level,
        index: i,
        ext: sn[sn.length-1].toLowerCase(),
        isDotted: isDotted,
      });
    // If we are dealing with a sub folder then chek that we are not in a server
    // folder - we dont care about the server side, public or private code at
    // all here...
    // Meteor only cares about top level folders so we allow all names at
    // greater levels than 0
    if (showDotted && stats.isDirectory())
      eachFile(filename, f, dotted, level + 1);
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
  } catch(err) {
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

/**
 * @method parseCode
 * @param {string} code Tha code to modify and scan for deps
 * @returns {Object} { code:'', deps: [] }
 */
var parseCode = function(currentDep, code) {
//console.log(code);
  var validChars = '_.$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890/-';
  var validCharsLookup = {};
  // Create index
  for (var a = 0; a < validChars.length; a++) validCharsLookup[validChars[a]] = a;

  var mode = 'code';
  var lastMode = mode;
  var escape = false;
  var lastWord = '';
  var currentWord = '';
  var append = '';
  var foundDefine = false;

  // Get the base name
  var currentBasename = path.basename(currentDep, '.js');
  // Cut off the file name
  var currentDepPath = path.join(path.sep, path.dirname(currentDep));
  // Get current dep name
  var currentDepName = path.join(currentDepPath, currentBasename).substring(1);
  // Init result
  var result = {
    code: '',
    current: currentDepName,
    deps: []
  };

  // Byte parser
  for (var i = 0; i < code.length; i++) {
    // Current char
    var c = code[i];
    // Prev char
    var cp = code[i-1];
    // Next char
    var cn = code[i+1];

    // Check previous char
    escape = (cp === '\\')

    // Mode setters and unsetters
    if (mode !== 'code') {
      if (mode === 'block-comment' && c == '*' && code[i+1] == '/') mode = 'code';
      if (mode === 'line-comment' && c == '\n') mode = 'code';
      if (mode === 'double-string' && c == '"' && !escape) mode = 'code';
      if (mode === 'single-string' && c == "'" && !escape) mode = 'code';
    } else {
      if (c == '/' && code[i+1] == '*') mode = 'block-comment';
      if (c == '/' && code[i+1] == '/') mode = 'line-comment';
      if (c == '"' && !escape) mode = 'double-string';
      if (c == "'" && !escape) mode = 'single-string';
    }


    // Keep lastWord upto
    if (validCharsLookup[c]) {
      currentWord += c;
    } else {
      // If we got an actual word we store this
      if (currentWord !== '') {

        // If in code block
        if (lastMode === 'code') {
          // If we hit the word "define" Then add define descriptor
          if (currentWord === 'define') {
            foundDefine = true;
            append = '\'' + currentDepName + '\', ';
          }
        }

        // If we just had a string
        if (lastMode === 'double-string' || lastMode === 'single-string') {
          // And last word was require 
          if (lastWord === 'require') {
            if (currentWord[0] == '.') {

              var resolveDepName = path.resolve(currentDepPath, path.basename(currentWord, '.js')).substring(1);
              // XXX: Todo resolve dependency
              // Correct the dependency by removing the current word from the
              // code buffer and insert the resolved dep name instead
              // First char to overwrite
              var newLength = result.code.length - currentWord.length;
              // Remove the origibal reference
              result.code = result.code.substring(0, newLength);
              // Add the full reference
              result.code += resolveDepName;

              //console.log(mode, currentDepPath, currentWord, resolveDepName);
              result.deps.push(resolveDepName);
              
            } else {
              // Do nothing to resolve - trust the user?
              result.deps.push(currentWord);
            }
          }
        }

        lastWord = currentWord;
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

  }

  // If no define is set then assume that we have unwrapped code
  if (!foundDefine)
    result.code = 'define("' + result.current + '", function(require, exports, module) {\n' + result.code + '\n});';

  // Return the result object
  return result;
};

/**
 * @method updateDependencies
 * @param {string} name Dependency name
 * @param {string} repoPath path of the repo
 */
var updateDependencies = function(name) {
  // Set repo path
  var repoPath = path.join(famonoRepoFolder, name);  
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
    if (file.ext === 'js') {
      // Remove the famonoRepoFolder part from the filenames
      var depName = file.filename.substring(famonoRepoFolder.length + 1);
      // console.log('RESOLVE DEPS IN: ' + depName);
      // console.log('Copy modifyed dep into ', libPath);
      // Parse and correct the code
      var result = parseCode(depName, fs.readFileSync(file.filename, 'utf8'));
      // Set deps relations
      deps[result.current] = result.deps;

      // Create the paths
      var filename = path.join(famonoLibFolder, depName);
      var dirname = path.dirname(filename);
      // XXX: Store the modifyed code to the famonoLibFolder
      // 1. create the base folder
      //console.log('ensureFolder', dirname);
      ensureFolder(dirname);
      // 2. store code into file
      //console.log('fileName', filename);
      fs.writeFileSync(filename, result.code, 'utf8');

    }
  });
  // Write the package deps
  fs.writeFileSync(depsPath, JSON.stringify(deps, null, '\t'), 'utf8');
};

var removeRepoFolder = function(name) {
  // Make sure we have a name set
  if (!name) return;
  // Set the repo path
  var repoPath = path.join(famonoRepoFolder, name);
  // Set the lib path
  var libPath = path.join(famonoLibFolder, name);
  // Set the deps folder
  var depsPath = path.join(famonoRepoFolder, '.' + name);

  removeFolder(repoPath);
  removeFolder(libPath);
  try {
    fs.unlinkSync(depsPath);
  } catch(err) {
    // Do nothing
  }
};

/**
 * @method checkGitFolders
 * @param {Object} config Configuration to match
 * @param {Object} oldConfig Configuration to check up on
 *
 */
var checkGitFolders = function(newConfig, oldConfig) {
  // Create one united config
  var config = objectMerge(oldConfig, newConfig);
  // Iterate over the deps
  for (var name in config) {
    // Set item helper
    var item = config[name];
    // Set repo path
    var repoPath = path.join(famonoRepoFolder, name);
    // Check if we have a repo
    if (item.git) {
      // Check if the git is different
      if (newConfig[name] && oldConfig[name] && newConfig[name].git !== oldConfig[name].git) {
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
          var result = exec('git pull', { cwd: repoPath });
          if (result.status == 0) {
            if (result.stdout !== 'Already up-to-date.\n') {
              console.log(green, 'Famono:', normal, 'updating dependencies "' + name + '" ');          
              updateDependencies(name);
            } else {
              console.log(green, 'Famono:', normal, 'git update "' + name + '" is up-to-date');
            }
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
          // We have to create the folder then
          fs.mkdirSync(repoPath);
          // Guess so then clone the repo to the repo folder
          console.log(green, 'Famono:', normal, 'downloading "' + item.git + '"');
          // Clone the repo
          var result = exec('git clone ' + item.git + ' ' + repoPath + ' --recursive');
          // Check if we have exited correctly
          if (result.status !== 0) {
            // Remove the folder
            removeRepoFolder(name);
            // Throw an error
            throw new Error('Famono: Error could not clone "' + name + '" ' + item.git + ': ' + result.stderr);
          } else {
            console.log(green, 'Famono:', normal, 'Scan the folder and create a dependency file for the repo');

            updateDependencies(name);
          }
        } 
      }
    } else {
      console.error('Famono could not find repo for "' + name + '", please set "git"');
    }
  }
};


var ensureDependencies = function(compileStep) {
  // We only want to deal with one require file at this moment... and it has to
  // be located in the lib folder.
  if (compileStep.inputPath !== 'lib/smart.require')
    return;

  // Read in the require files
  var requireFile = compileStep.read().toString('utf8');
  var lastRequireFile = (fs.existsSync(configFolder)) ? fs.readFileSync(configFolder, 'utf8') : '{}';

  // We only want to handle if the config has actually changed
  if (lastRequireFile !== requireFile) {

    var newConfig, oldConfig;

    try {
      newConfig = JSON.parse(requireFile);
      oldConfig = JSON.parse(lastRequireFile);
    } catch(err) {
      throw new Error('Famono: Error "Invalid JSON",', err.message);
    }

    //console.log('CHECK REPO FOLDER');
    // Make sure the repo is up to date
    checkGitFolders(newConfig, oldConfig);
    // Update the last config
    fs.writeFileSync(configFolder, requireFile, 'utf8');

  } else {
    // console.log('CONFIG NOT CHANGED');
  }

};

// Scan the users source code for dependencies...
var sourceCodeDependencies = function() {
  // Source deps
  var sourceDeps = {};
  // Get the main code folder
  var codeFolder = process.cwd();
  // Scan the source files to find the dependency list
  eachFile(codeFolder, function(file) {
    // Get the folder
    var folder = file.filename.substring(codeFolder.length);

    // We dont care about public, private, server or package root folders
    // And we want javascript files and they may not be prefixed dotted
    if (!/^\/public\/|^\/private\/|^\/server\/|^\/package\//.test(folder) &&
            file.ext == 'js' && !file.isDotted) {

      // Load the code
      var code = fs.readFileSync(file.filename, 'utf8');
      // Parse the file
      var result = parseCode(folder, code);
      // Store the source dependencies
      sourceDeps[folder] = result.deps;

    }

  });

  return sourceDeps;  
};

var getDepRoot = function(depName) {
  var list = depName.split('/');
  return list[0];
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
        root: getDepRoot(depName),
      });
    }
  }
};

var loadDependenciesRegisters = function(sourceDeps) {
  var result = {};

  eachSourceDeps(sourceDeps, function(dep) {

    if (typeof result[dep.root] === 'undefined') {

      var filename = path.join(famonoRepoFolder, '.' + dep.root);
      try {
        result[dep.root] = JSON.parse(fs.readFileSync(filename, 'utf8'));
      } catch(err) {
        console.log(green, 'Famono:', normal, 'Error, could not load library "' + dep.root + '"');
      }
      
    }

  });

  return result;
};

var neededDeps = {};
var neededDepsIndex = 0;
var loadDepsList = [];

var resolveDependencies = function(wanted, libraryDeps, level) {
  level = level || 0;
  // We check wanted
  // wanted = ['dep1', 'dep2']
  for (var i = 0; i < wanted.length; i++) {
    var name = wanted[i];
    if (typeof neededDeps[name] === 'undefined') {
      // Add the dep and resolve its deps
      neededDeps[name] = level;
      // Get the lib root
      var root = getDepRoot(name);
      // Get the nested deps
      var nextWanted = libraryDeps[root][name];
      // Add the deps to the load list
      loadDepsList.push({ 
        name: name,
        level: level,
        index: neededDepsIndex++,
        deps: nextWanted.length
      });
      // Resolve the deps
      resolveDependencies(nextWanted, libraryDeps, level+1);
    }

  }
};


// compileStep.appendDocument({ section: "head", data: results.head });

Plugin.registerSourceHandler("require", function (compileStep) {
  compileStep.rootOutputPath = '/lib/';
  // We only care about generating client-side code...
  if (compileStep.arch !== 'browser')
    return;

  console.log('\nEnsure dependencies...');
  // We check if the config has changes and load / unload dependencies
  // accordingly          
  ensureDependencies(compileStep);

  // Scan the user code for require statements...
  var sourceDeps = sourceCodeDependencies();

  // Load libraries registers
  var libraryDeps = loadDependenciesRegisters(sourceDeps);

  // Load needed deps list
  for (var file in sourceDeps) {
    // Get the deps pr. file
    var deps = sourceDeps[file];
    // Resolve the files
    resolveDependencies(deps, libraryDeps);
  }


  // Add the library javascript
  for (var i = 0; i < loadDepsList.length; i++) {
    var dep = loadDepsList[i];
    var filename = path.join(famonoLibFolder, dep.name + '.js');
    compileStep.addJavaScript({
      path: 'lib/' + dep.name + '.js',
      sourcePath: 'lib/' + dep.name + '.js',//filename,
      data: fs.readFileSync(filename, 'utf8'),
      bare: true
    });
    
  }

});