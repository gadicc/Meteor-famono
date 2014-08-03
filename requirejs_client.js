// The library contains all the dependencies, they are not initialized
var modules = {};

Famono = {};

var getModule = function(name, isDefining) {
  if (name) {

    var last = '/' + name.split('/').pop();
    // We either return the module or init an empty module for tracking
    return modules[name] || modules[name + '/index'] || modules[name + last] ||
      (modules[name] = { exports: { prototype: {} }, callbacks: [], loaded: (isDefining) ? false : null });

  } else {
    return {};
  }
};

/**
 * @method _require
 * @param {String} name Name of module
 * @returns {Any} Exported data
 * This function expects that any dependencies are all loaded
 * This function will return the module instance or initialize the module
 */
Famono.require = function(name, f) {
  // one could do require([deps], function( /* args */ ) { })
  if (typeof f == 'function')
    return Famono.define(name, f);

  // Get the module
  var module = getModule(name);
  // Check that the module is loaded
  if (module.loaded === true) {

    // Check if the library is found
    if (module.init) {
      // If we are loaded and we dont have a function then return then
      // assume that we are already initialized and return exports
      return module.exports;
    } else {

      // Set init flag
      module.init = true;

      var moduleDefinitions = (typeof module.f == 'function') ? [{ f: module.f }] : module.f;
      // This is the current format Famo.us uses / requireJs or commonJS
      for (var i = 0; i < moduleDefinitions.length; i++) {
        // Helper
        var current = moduleDefinitions[i];
        // function call
        if (typeof current.deps !== 'undefined') {
          // Amd?
          var deps = [];
          for (var d = 0; d < current.deps.length; d++) {
            if (!/^\.|^\//.test(current.deps[d]))
              deps.push(Famono.require(current.deps[d]));
          }
          // Serve deps
          try {
            var returnedModule = current.f.apply(current.f, deps);
            // XXX: Should we somehow extend the module.exports with objects
            // returned?
            //if (returnedModule) { _.extend(module.exports, returnedModule ); }
          }catch(err) {
            console.warn('Famono: Could not load part of module "' + name + '" define(' + (d+1) + '), Error: ' + err.message, err.stack);
          }
        } else if (current.name) {
          // noop
        } else {
          // commonJS
          try {          
            var returnedModule = current.f(Famono.require, {}, module);
            // Be able to return the module
            module.exports = returnedModule || module.exports;
          } catch(err) {
            console.error('Famono: Could not load module "' + name + '",', err.stack);

          }
        }
      }

      // Clean up, help GC
      module.f = null;


      // Set the now required library
      modules[name] = module;

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
  console.log('Famono lazyloading', libraryName);
  // Get pointer to the head tag
  var head = document.getElementsByTagName('head').item(0);

  // Create script element
  var script = document.createElement('script');

  // Set the onload event
  script.onload = function() {
    callback(null, libraryName);
  };

  // Set the on error event
  script.onerror = function(err) {
    callback(err, libraryName);
  };

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
  if (deps === '' + deps) deps = [deps];
  // XXX: deps can be a string or an array of strings
  // 1. ensure all deps are loaded by checking modules[]
  loadLibraries(deps, function(done) {
    // 2. ensure all deps are initialized by checking modules[]
    var result = [];
    // Init the dependecies
    for (var i = 0; i < deps.length; i++) result.push(Famono.require(deps[i]));
    // 3. run f
    f.apply({}, result);
  });
};

/**
 * @method _defineModule
 * @param {String} name Name of module
 * @param {Array} deps List of dependencies to load
 * @param {Function|array of functions} f The module
 */
_defineModule = function(name, deps, f) {
  // Get module
  var module = getModule(name, true);
  // Check for function
  if (typeof f == 'undefined' || (typeof f !== 'function' && !f.length))
    throw new Error('Famono: library "' + name + '" require a function');

  // XXX: TODO we could be called multiple times, we want to keep the module
  // export intact but we may have to stack functions in f instead of having one
  // module definition.
  // We currently initialize the module using require so the require statement
  // should be the one to call all the functions
  // Check library
  if (module.loaded === true)
    throw new Error('Famono: library "' + name + '" already defined');
  // 1. Make sure the deps are loaded
  loadLibraries(deps, function(done) {
    // Mark this module as loaded
    done(name, f);
    // Check if this is a global?
    if (name === null) f(Famono.require, {}, { exports: window });
  });
}

/**
 * @method _defineGlobal
 * @param {String} name Name of module
 * @param {Array} deps List of dependencies to load
 * @param {Function} f The module
 */
_defineGlobal = function(f) {
  // Define a global thing...
  Famono.define(null, [], f);
};

var _parseDefineArguments = function(name, argsInput) {
  var result = {};
  
  // Convert into array
  var args = Array.prototype.slice.call(argsInput);
  
  // Get the function
  result.f = args.pop();
  
  // Check that we got a function
  if (typeof result.f !== 'function')
    throw new Error('Famono: ' + name + ' requires function');
  
  // If first argument is string then set it and get on
  if (args[0] === ''+args[0] || args[0] === null) result.name = args.shift();

  // If anything left it should be deps definition?
  if (args.length) result.deps = args.shift();

  if (result.deps && typeof result.deps.length == 'undefined')
    throw new Error('Famono: ' + name + ' expected array of dependencies but found ' + (typeof result.deps));

  // If name is set but no deps then init empty deps array
  if (typeof result.name !== 'undefined' && !result.deps) result.deps = [];

  // We should not have more than 3 arguments
  if (args.length) {
    // XXX: remove when issues resolved
    console.warn('Famono: ' + name + ' debug (Report to raix issue #55):', argsInput, 'Def:', result, 'Left', args);

    throw new Error('Famono: ' + name + ' passed too many arguments');
  }

  // Return parsed arguments { name, deps, f }
  return result;
};

/**
 * @method define
 * @param {String} [name] Name of module
 * @param {Array} deps List of dependencies to load
 * @param {Function} f The module
 *
 * > If no name is passed then deps are passed to f as arguments
 */
Famono.define = function(/* name, deps, f or deps, f */) {
  var def = _parseDefineArguments('define', arguments);

  if (typeof def.name === 'undefined' && !def.deps && def.f) {
    // Return the load module define(function() {})
    return _defineGlobal(def.f);

    // define([deps, ... , deps], function() {});
  } else if (typeof def.name === 'undefined'  && def.deps && def.f) {
    // Return the load module
    return _loadModule(def.deps, def.f);

    // define('name', [deps, ... , deps], function() {});
  } else if (typeof def.name !== 'undefined' && def.deps && def.f) {
    // Return the define module
    return _defineModule(def.name, def.deps, def.f);

    // Invalid arguments
  } else {
    throw new Error('define got invalid number of arguments');
  }
};

// Simulate support?
Famono.define.amd = true;

// Noop module definition
var noopModuleDefinition = function() {};

/* @method scope
 * @param {function} libraryModule The function setting the define/require scope
 */
Famono.scope = function(/* name [, deps] , libraryModule */) {
  var scope = _parseDefineArguments('Famono.scope', arguments);
  try {
    var moduleDefinitions = [];
    var scopedDefine = function(/* arguments */) {
      var def = _parseDefineArguments('define', arguments);

      if (typeof def.name !== 'undefined') {
        // Load and define the module
        _defineModule(def.name, def.deps, def.f);
      } else {
        // Stack the definitions
        moduleDefinitions.push(def);
      }
    };

    // Simulate support?
    scopedDefine.amd = true;

    // Define the module
    scope.f(Famono.require, scopedDefine);

    // If the module have no definitions we cheat at hand it one
    // there could be valid reasons for a module to have no definition.
    // eg. if defines in the module define new modules.
    if (!moduleDefinitions.length) moduleDefinitions = noopModuleDefinition;

    // Load and define the module
    _defineModule(scope.name, scope.deps, moduleDefinitions);
  } catch(err) {
    // XXX: Warn for now?
    // console.log('ERROR:', scope.name, scope.deps);
    console.warn(err.message);
  }
};

// Add as globals - This part is deprecating...
if (typeof window.define === 'undefined') window.define = Famono.define;
if (typeof window.require === 'undefined') window.require = Famono.require;