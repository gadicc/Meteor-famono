# The black magic of Famono
So a while back I created a small package called "Famono" - The name speaks very little of what it does, so I think its time for a recap.

### What is Famono?
Its a Meteor package that adds library code from sources like bower and github.

### Using libraries
When Famono is installed it created a file `lib/smart.require` and it looks something like this:
```js
{
  "famous": {
    "git": "https://github.com/Famous/famous.git"
  },
  "famous.polyfills": {
    "git": "https://github.com/Famous/polyfills.git"
  }
}
```

So this basically makes famono recognize the global scope `famous`. It also tells famono that the `famous.git` is mounted on the scope directly while `polyfills.git` is mounted on `famous.polyfills` extending the global.

### The black magic...
Everytime you change something in your code Meteor runs source handlers. This could be source handlers that converts coffeescript into javascript or less files into css.

### Code scanner / parser
Famono handles the `smart.require` file only - but we run a small and very fast parser on the client-side app code on code edit. This parser figures out what parts of the libraries should be included and figure out library dependencies while at it.

### What actually happens when I edit the `smart.require`?
Well, several things but the basic stuff is that:

1. Famono checks for git updates making sure your libraries are up to date
2. Famono checks to se if a library have been added/updated/removed
3. Famono will try to fetch the library code from github or bower

When library have been downloaded its actually parsed and prepared. It creates a library registry of dependencies enabling Famono to be really fast when parsing your code.

### Downloading and parsing library code
Famono works in two folders making sure to seperate things:
`.meteor/famono-repos` - this is where libraries are downloaded
In famous case its put into the `.meteor/famono-repos/famous` folder - and famono creates a dependecy list pr. library so for example the file `.meteor/famono-repos/.famous` contains an object like:
```
{
    "famous/core/Context": [
        "famous/core/RenderNode",
        "famous/core/EventHandler",
        "famous/core/ElementAllocator",
        "famous/core/Transform",
        "famous/transitions/Transitionable"
    ],
    "famous/core/ElementAllocator": [],
    "famous/core/Engine": [
        "famous/core/Context",
        "famous/core/EventHandler",
        "famous/core/OptionsManager"
    ],
    "famous/core/Entity": [],
    "famous/core/EventEmitter": [],
    "famous/core/EventHandler": [
        "famous/core/EventEmitter"
    ],
    // ...
```
This simply lists the dependencies of every dependency provided by the library.

### Why parse the original library code?
The original library repo like famous is missing some things in its define call so famono will change this:
```js
define(function(require, exports, module) {
// Will become:
define('famous/core/Context', ["famous/core/RenderNode","famous/core/EventHandler","famous/core/ElementAllocator","famous/core/Transform","famous/transitions/Transitionable"], function(require, exports, module) {
```
Now this is actually not an improvement other than it makes lazyloading possible and it unifies how client-side require work.

### Future library format
In the future famono will actually convert this into a much simpler scheme deprecating the use of require and define:
```js
// Simple export - only one export pr. file
= 'foo';
= 12;
= {};
= [];
= function() {};
// Using closure
= (function() {
    return function() {
        console.log('Hello world');
    };
})();
```

### More black magic...
So when Famono see a reference to a library scope it adds the dependency to the client bundle code.
```js
  // Using library globals
  Context = famous.core.Context;
  // The old deprecating require style still works:
  Context = require('famous/core/Context');
```
Famono will add the dependencies for `famous/core/Context`
```js
"famous/core/Context": [
    "famous/core/RenderNode",
    "famous/core/EventHandler",
    "famous/core/ElementAllocator",
    "famous/core/Transform",
    "famous/transitions/Transitionable"
]
```
And all their dependencies until we got everything needed...

### More finegrained dependencies
So we have more finegrained dependencies instead of just adding the whole famous library into the client bundle.

If you view source in your browser while running the famono timbre version you will see something like:
```html
  <script type="text/javascript" src="/lib/famous/core/EventEmitter.js?4deb62e5683698b4a2f230e91a9e1397cb7921e8"></script>
  <script type="text/javascript" src="/lib/famous/core/EventHandler.js?b9b4b3424d40bcfaa24c50dbbc719ebf83968981"></script>
  <script type="text/javascript" src="/lib/famous/core/OptionsManager.js?e69f173838ca5f0227af4211a649d34b17dfcf6a"></script>
  <script type="text/javascript" src="/lib/famous/core/Entity.js?b38c264d6a992aa12acd77d851b15f677aa1f9a1"></script>
  <script type="text/javascript" src="/lib/famous/core/Transform.js?ed9bf8a3f866c8a471fcab5d20ebd71f8aa7f2f0"></script>
  <script type="text/javascript" src="/lib/famous/core/SpecParser.js?f8436aded8ce6f290793e896fa567daf6c22c46f"></script>
  <script type="text/javascript" src="/lib/famous/core/RenderNode.js?2b1e8e93d81b94ad1c72c57b0b595dff55f85c6f"></script>
  <script type="text/javascript" src="/lib/famous/core/View.js?378ff7fb7d1969930b40f854d5990a562d706ba7"></script>
  <script type="text/javascript" src="/lib/famous/core/Surface.js?9fb247d1757a66bd8db2264a3bf0d91e7584761d"></script>
  <script type="text/javascript" src="/lib/famous/utilities/Utility.js?a35d4c80fc2544eae4abb8d4b805d167faa654e7"></script>
  <script type="text/javascript" src="/lib/famous/transitions/MultipleTransition.js?78a29463f517e3c3adb98299ef7b605e0a4d97c2"></script>
  <script type="text/javascript" src="/lib/famous/transitions/TweenTransition.js?c97d2402a64786c6741607b0c8009952b4a46af1"></script>
  <script type="text/javascript" src="/lib/famous/transitions/Transitionable.js?b1b8027fb87ad18f3ee966b3f01ac76737ab6942"></script>
  <script type="text/javascript" src="/lib/famous/transitions/TransitionableTransform.js?e775014d7ca75f90373f49a323425f0fc9aeb645"></script>
  <script type="text/javascript" src="/lib/famous/core/Modifier.js?56d5bc3231e6f9fd1884405f2ad0941dfa2cc683"></script>
  <script type="text/javascript" src="/lib/famous/modifiers/StateModifier.js?c418d24b6f2b6fb2451ade0e2d3b24a3c2255723"></script>
  <script type="text/javascript" src="/lib/famous/surfaces/ImageSurface.js?136eb8bc66874a8d308afc46d4bd5518f422c675"></script>
  <script type="text/javascript" src="/lib/famous.polyfills/classList.js?38853fb6cdc0247044e430d75052c68975f66919"></script>
  <script type="text/javascript" src="/lib/famous.polyfills/functionPrototypeBind.js?9c4634e33b6054a7ab8905c9e55cd70599f7166e"></script>
  <script type="text/javascript" src="/lib/famous.polyfills/requestAnimationFrame.js?32b149a8d9cdf5216248adb52d04a45507c47e5d"></script>
  <script type="text/javascript" src="/lib/famous.polyfills/index.js?71314e6b943be3fd2a75f7aebe88600e79c1b7ef"></script>
  <script type="text/javascript" src="/lib/famous/core/famous.js?22ae538796c0295fbb56482979a998cf8ce91537"></script>
  <script type="text/javascript" src="/lib/famous/core/ElementAllocator.js?ba40bec9e1087de0910fe22918db80274d97f686"></script>
  <script type="text/javascript" src="/lib/famous/core/Context.js?14193ddbe4d31e3e7414b75fcd438644acf92d5a"></script>
  <script type="text/javascript" src="/lib/famous/core/Engine.js?d6111123eda73891cb10a40c9625b7cef9bb9e4d"></script>
  <script type="text/javascript" src="/lib/famous/inputs/GenericSync.js?75e57602567863dbb1bef7f75ed5a6ff46648e49"></script>
  <script type="text/javascript" src="/lib/famous/inputs/MouseSync.js?7f38982004163b450b110ee3267a70dd61169555"></script>
  <script type="text/javascript" src="/lib/famous/inputs/TouchTracker.js?07e7213e82ce2eefcec51ccc14c84a83b2700985"></script>
  <script type="text/javascript" src="/lib/famous/inputs/TouchSync.js?2591c5d66070a31816d8054cfe730e6b21b17180"></script>
  <script type="text/javascript" src="/lib/famous/utilities/Timer.js?ca4bddd099cd4bed748e463573aac6b1d2494902"></script>
  <script type="text/javascript" src="/lib/famous/views/HeaderFooterLayout.js?881316f5efc626598ca62ad02e18ae17f10efbdf"></script>
  <script type="text/javascript" src="/lib/global-definitions.js?ff214da0012cec1d48cc6f33373757c506bfc938"></script>
```

Note:
This is in seperate files when in development mode.
and..
Famono will actually know that `famous.polyfills` should really load the `famous.polyfills.index` dependency.

### Global definitions
The new and interresting file is the last in line `/lib/global-definitions.js` it currently looks something like:
```js
famous = {
  polyfills: {
    classList: require('famous.polyfills/classList'),
    functionPrototypeBind: require('famous.polyfills/functionPrototypeBind'),
    requestAnimationFrame: require('famous.polyfills/requestAnimationFrame'),
    index: require('famous.polyfills/index')
  },
  core: {
    famous: require('famous/core/famous'),
    Entity: require('famous/core/Entity'),
    Transform: require('famous/core/Transform'),
    SpecParser: require('famous/core/SpecParser'),
    RenderNode: require('famous/core/RenderNode'),
    EventEmitter: require('famous/core/EventEmitter'),
    EventHandler: require('famous/core/EventHandler'),
    ElementAllocator: require('famous/core/ElementAllocator'),
    Context: require('famous/core/Context'),
    OptionsManager: require('famous/core/OptionsManager'),
    Engine: require('famous/core/Engine'),
    View: require('famous/core/View'),
    Modifier: require('famous/core/Modifier'),
    Surface: require('famous/core/Surface')
  },
  transitions: {
    MultipleTransition: require('famous/transitions/MultipleTransition'),
    TweenTransition: require('famous/transitions/TweenTransition'),
    Transitionable: require('famous/transitions/Transitionable'),
    TransitionableTransform: require('famous/transitions/TransitionableTransform')
  },
  utilities: {
    Utility: require('famous/utilities/Utility'),
    Timer: require('famous/utilities/Timer')
  },
  inputs: {
    GenericSync: require('famous/inputs/GenericSync'),
    MouseSync: require('famous/inputs/MouseSync'),
    TouchTracker: require('famous/inputs/TouchTracker'),
    TouchSync: require('famous/inputs/TouchSync')
  },
  modifiers: {
    StateModifier: require('famous/modifiers/StateModifier')
  },
  surfaces: {
    ImageSurface: require('famous/surfaces/ImageSurface')
  },
  views: {
    HeaderFooterLayout: require('famous/views/HeaderFooterLayout')
  }
};
```

Not much black magic there - it simply creates the library global for you using plain old require.

### Future of global definitions
This is part of a slow refactoring of the Famono package out factoring define and require into separate packages. The library global definition will at some point contain the exports directly like normal js code.
Eg.
```js
famous = {
  polyfills: {
    classList: (function() { /* We simply skip define */ })(),
```

--

*... Ran out of time for now*

Kind regards Morten *(aka RaiX)*
