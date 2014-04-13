//console.log(WebApp.clientProgram.manifest);

console.log(__meteor_bootstrap__.serverDir);

Famous = {
  require: function(dep) {
    throw new Error('Famous require cannot run on the server');
  }
};