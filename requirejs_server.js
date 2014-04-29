require = function() {
  throw new Error('Famous "require" cannot run on the server');
}

define = function() {
  throw new Error('Famous "define" cannot run on the server');
};