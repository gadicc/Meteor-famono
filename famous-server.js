Famous = {
  require: function(dep) {
    throw new Error('Famous require cannot run on the server');
  }
};