
if (typeof global.require == 'undefined') global.require = function () {
  throw new Error('Famous "require" cannot run on the server');
}

if (typeof global.define == 'undefined') global.define = function () {
  throw new Error('Famous "define" cannot run on the server');
};

Famono = {};

Famono.define = function () {
  throw new Error('Famous "Famono.define" cannot run on the server');
};

Famono.require = function () {
  throw new Error('Famous "Famono.require" cannot run on the server');
};

Famono.scope = function () {
  throw new Error('Famous "Famono.scope" cannot run on the server');
};