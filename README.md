FAMONO
======

### What is it?

Well in short it's a Famo.us package system inside of the Meteor.js Package system - or is it requireJS? one could actually remove the `standard-app-packages` from the app and have a pure Famo.us app.

### Install
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

>Note: You can set either a branch or tag *(if both is set only tag is used)*
> ```js
>{
>  "foo": {
>    "git": "https://github.com/Foo/bar.git"
>    "branch": "master",
>    "tag": "v1.0.0",
>    "recursive": false // default is true, true == load submodules
>   }
> }
> 
> ```

This enables you to do:
```js
// Make sure dom got a body...
Meteor.startup(function() {
    // Rig some famo.us deps
    require("famous-polyfills"); // Add polyfills
    require("famous/core/famous"); // Add the default css file

    // Basic deps
    var Engine           = require("famous/core/Engine");
    var Modifier         = require("famous/core/Modifier");
    var Surface          = require("famous/core/Surface");
    var RenderController = require("famous/views/RenderController");

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

### Force a reset of the dependency registry
Force clean dep registry:

1. edit `lib/smart.require` set it to `{}` *empty* and save
2. restore `lib/smart.require` with the deps you had in there and save

### Package creator?
You can create a repo and have the user add it to the project just like the `Famo.us` packages.

Or if your users use `mrt` or place packages in the app `packages` folder Famono will look for a `package.require`
Eg.:
```js
{
  "require": ["famous/core/Engine"]
}
```
*This will load the deps for now - at some point one could read the `package.js` and check if it depends on famono, then get the client-side js and pass the code on to the famono code parser - Maybe in a future version.*

Kind regards Morten (aka raix)