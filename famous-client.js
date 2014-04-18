// The library contains all the dependencies, they are not initialized
var modules = {};

var getModule = function(name) {
  // We either return the module or init an empty module for tracking
  return modules[name] || modules[name + '/index'] || (modules[name] = { exports: {}, callbacks: [], loaded: null });
};

/**
 * @method _require
 * @param {String} name Name of module
 * @returns {Any} Exported data
 * This function expects that any dependencies are all loaded
 * This function will return the module instance or initialize the module
 */
require = function(name) {
  // Get the module
  var module = getModule(name);  
  // Check that the module is loaded
  if (module.loaded === true) {

    // Check if the library is found
    if (typeof module.f !== 'function') {
      // If we are loaded and we dont have a function then return then
      // assume that we are already initialized and return exports
      return module.exports;
    } else {

      // This is the current format Famo.us uses / requireJs or commonJS
      module.f(require, {}, module);

      // Set the now required library
      modules[name] = module;

      // Clean up, help GC
      module.f = null;

      // We return the things we want to export
      return module.exports;

    }

  } else {
    // The module is not defined
    throw new Error('Famono: library "' + name + '" not defined');
  }

};

/**
 * @method _loadScript
 * @param {String} libraryName Library to load
 * @param {Function} callback (err, libraryName)
 * This method loads javascript libraries
 */
var _loadScript = function(libraryName, callback) {
  // Get pointer to the head tag
  var head = document.getElementsByTagName('head').item(0);

  // Create script element
  var script = document.createElement('script');

  // Set the onload event
  script.onload = function() { callback(null, libraryName); };

  // Set the on error event
  script.onerror = function(err) { callback(err, libraryName); };

  // Set the type to js
  script.type = 'text/javascript';

  // Set src to module
  script.src = '/lib/' + libraryName;

  // Inject the script tag
  head.appendChild(script);  
};

/**
 * @method loadModuleDefinition
 * @param {String} name module to load
 * @param {Function} callback() is called when module is defined
 * This function load module definitions
 */
var loadModuleDefinition = function(name, f) {
  // Make sure the callback is set
  if (typeof f !== 'function')
    throw new Error('Famono: loadModuleDefinition require a callback as function');
  // Get the module
  var module = getModule(name);
  // Check if module is loaded
  if (module.loaded === true) {
    // We callback instantly
    f();
  } else {
    // Add the function
    module.callbacks.push(f);
    // load module...
    if (module.loaded === null) {
      // Set the module to be loading
      module.loaded = false;
      // We are not loading the module so we start loading
      _loadScript(name, function(err) {
        if (err) {
          // On error we reset
          // XXX: should we start a retry algorithm? eg. 5 attepmts then final
          // failure?
          module.loaded = null;
        }
        // We dont have to do anything else - the module will trigger loaded
      });
    }
  }
};

/**
 * @method moduleDefineDone
 * @param {String} name module to mark as defined
 * @param {Function} f The module function
 * This function marks modules as defined
 */
var moduleDefineDone = function(name, f) {
  if (name) {
    var module = getModule(name);
    // Set loaded flag
    module.loaded = true;
    // Register the library
    module.f = f;    
    // Call back all listeners
    while (module.callbacks.length) {
      // We pop out the listener callbacks
      module.callbacks.pop()(null, name);
    }
  }
};

/**
 * @method loadLibraries
 * @param {Array} deps List of dependencies to load
 * @param {Function} callback This function is called when deps are loaded
 * This function makes sure only to run callback when all dependecies are loaded
 */
var loadLibraries = function(deps, callback) {
  // Expected callbacks
  var count = deps && deps.length;
  // Load dependencies
  if (count) {
    // Load each dep
    for (var i = 0; i < deps.length; i++) {
      // We wait until the submodules have loaded
      loadModuleDefinition(deps[i], function() {
        if (--count === 0) callback(moduleDefineDone);
      });

    }
  } else {
    // Call back instantly if we dont have any dependencies
    callback(moduleDefineDone);
  }
};

/**
 * @method _loadModule
 * @param {Array} deps List of dependencies to load
 * @param {Function} f This function is called when deps are loaded
 * Dependencies are passed on to function f as parametres
 */
_loadModule = function(deps, f) {
  //throw new Error('Not implemented');
  // Check for function
  if (typeof f !== 'function')
    throw new Error('Famono: define require a function');
  // Convert strings to array of string
  if (deps === ''+deps) deps = [deps];
  // XXX: deps can be a string or an array of strings
  // 1. ensure all deps are loaded by checking modules[]
  loadLibraries(deps, function(done) {
    // 2. ensure all deps are initialized by checking modules[]
    var result = [];
    // Init the dependecies
    for (var i = 0; i < deps.length; i++) result.push(require(deps[i]));
    // 3. run f
    f.apply({}, result);
  });
};

/**
 * @method _defineModule
 * @param {String} name Name of module
 * @param {Array} deps List of dependencies to load
 * @param {Function} f The module
 */
_defineModule = function(name, deps, f) {
  // Get module
  var module = getModule(name);
  // Check for function
  if (typeof f !== 'function')
    throw new Error('Famono: library "' + name + '" require a function');

  // Check library
  if (module.loaded === true)
    throw new Error('Famono: library "' + name + '" already defined');

  // 1. Make sure the deps are loaded
  loadLibraries(deps, function(done) {
    // Mark this module as loaded
    done(name, f);
  });
}

/**
 * @method define
 * @param {String} [name] Name of module
 * @param {Array} deps List of dependencies to load
 * @param {Function} f The module
 *
 * > If no name is passed then deps are passed to f as arguments
 */
define = function(/* name, deps, f or deps, f */) {
  // define([deps, ... , deps], function() {});
  if (arguments.length === 2) {
    // Return the load module
    return _loadModule.apply(this, arguments);

  // define('name', [deps, ... , deps], function() {});
  } else if (arguments.length == 3) {
    // Return the define module
    return _defineModule.apply(this, arguments);

  // Invalid arguments
  } else {
    throw new Error('define got invalid number of arguments');
  }
};