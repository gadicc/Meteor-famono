// The library contains all the dependencies, they are not initialized
var library = {};

var reqiredLibraries = {};

require = function(name) {
  // Return libraries already initialized
  if (typeof reqiredLibraries[name] !== 'undefined')
    return reqiredLibraries[name].exports;

  var f = library[name];

  // Check if the library is found
  if (typeof f === 'undefined')
    throw new Error('Famono: library "' + name + '" not defined');

  // XXX: Not familiar with this - investigate when got time...
  var exports = {};

  // XXX: Should the module contain other functionalities?
  var module = {
    exports: {}
  };


  // This is the current format Famo.us uses / requireJs
  f(require, exports, module);

  // Set the now required library
  reqiredLibraries[name] = module;

  // We return the things we want to export
  return reqiredLibraries[name].exports;
};

define = function(name, f) {
  // Check for function
  if (typeof f !== 'function')
    throw new Error('Famono: library "' + name + '" require a function');

  // Check library
  if (typeof library[name] !== 'undefined')
    throw new Error('Famono: library "' + name + '" already defined');

  // Register the library
  library[name] = f;
};