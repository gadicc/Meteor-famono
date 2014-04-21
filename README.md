FAMONO
======

### What is it?

Well in short it's a Famo.us package system inside of the Meteor.js Package system - or is it requireJS/commonJS or AMD? one could actually remove the `standard-app-packages` from the app and have a pure Famo.us app.

### Install
__Command line tool__
```bash
$ npm install famono -g
```

__Meteor package__
```bash
$ mrt add famono
```
*Requires: `Meteor`, `Meteorite` and ofcourse `git` all easy to install*

### Edit the library register
__What?__
Well - you can add any library code you want to - even none Famo.us stuff.

__How:__
When you install the package you will get a `lib/smart.require` in your main app folder, and it would look something like:

```js
{
  "famous": {
    "git": "https://github.com/Famous/famous.git"
  },
  "famous-polyfills": {
    "git": "https://github.com/Famous/polyfills.git"
  }
}
```
*you can mount any git repo on a namespace, oh and in Meteor editing this file will trigger either an add/download or removal of the changed namespace - LIVE.*

This enables you to do:
```js
  // Rig some famo.us deps
  require("famous-polyfills"); // Add polyfills
  require("famous/core/famous"); // Add the default css file

  // Basic deps
  var Engine           = require("famous/core/Engine");
  var Modifier         = require("famous/core/Modifier");
  var RenderController = require("famous/views/RenderController");

  // Make sure dom got a body...
  Meteor.startup(function() {
    var Surface = require("famous/core/Surface"); // This one needs document.body

    var mainContext = Engine.createContext();
    var renderController = new RenderController();
    var surfaces = [];
    var counter = 0;

    for (var i = 0; i < 10; i++) {
        surfaces.push(new Surface({
             content: "Surface: " + (i + 1),
             size: [200, 200],
             properties: {
                 backgroundColor: "hsl(" + (i * 360 / 10) + ", 100%, 50%)",
                 lineHeight: "200px",
                 textAlign: 'center'
             }
        }));
    }

    renderController.show(surfaces[0]);

    Engine.on("click", function() {
        var next = (counter++ + 1) % surfaces.length;
        this.show(surfaces[next]);
    }.bind(renderController));

    mainContext.add(new Modifier({origin: [.5, .5]})).add(renderController);

  });
```

### Will all the stuff be loaded to the client??

Nope - the package scans your code and figure outs dependencies at your edit.

### Additional libraries
You can add additional libraries like `moment`/`underscore` etc.
Use the `famono` CLI tool:
```bash
$ famono -a moment
```
*Uses the Bower database as lookup*

or edit `lib/smart.require` manually:

```js
  "moment": {
    "git": "https://github.com/moment/moment.git"
  },
  "underscore": {
    "git": "https://github.com/jashkenas/underscore.git"
  },
  "numeral": {
    "git": "https://github.com/adamwdraper/Numeral-js"
  }
```

### Force a reset of the dependency registry
Force clean dep registry:

1. edit `lib/smart.require` set it to `{}` *empty* and save
2. restore `lib/smart.require` with the deps you had in there and save

### Setting branch or tags
Setting git references specific you can.

You can set either a branch or tag *(if both is set only tag is used)*
```js
{
  "foo": {
    "git": "https://github.com/Foo/bar.git"
    "branch": "master",
    "tag": "v1.0.0",
    "recursive": false // default is true, true == load submodules
   }
}
```

> Note: "git" can be set to local folders too if developing locally. But you may have to force reset if referenced code has changed.

### Lazy loading modules
Not sure if its needed - but its added..
```js
  define('famous/core/Surface', function(Surface) {
    // This code will be called when all dependencies and their deps
    // are loaded and ready.
  });
```

### Define modules in client code
```js
  define('module', ['dep1', .. , 'depn'], function(require, exports, module) {
    // Using require in here will throw an error if the dependencies are not
    // ready / defined...
  });
```
*In library code its parsed*

### Package creator?
You can create a repo and have the user add it to the project just like the `Famo.us` packages.

Something like: *(foo.js)*
```js
  // Famono will parse the module for dependencies and transform this before
  // its sent to the client.
  define(function(require, exports, module) {
    // Some code...
    module.exports = 'bar';
  });
```


Kind regards Morten (aka raix)