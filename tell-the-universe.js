var library = require("module-library")(require)


module.exports = library.export(
  "tell-the-universe",
  function() {

    function aWildUniverseAppeared(name, pathsByName) {
      var universe = new ModuleUniverse(name)

      var signature = JSON.stringify(pathsByName)

      var paths = []
      var names = []

      for(var name in pathsByName) {
        var modulePath = pathsByName[name]
        paths.push(modulePath)
        names.push(name)
      }

      universe.baseLog = newBaseLog(names)
      universe.modulePaths = paths
      universe.names = names
      universe.signature = signature

      return universe
    }

    function ModuleUniverse(name, next) {
      if (typeof name != "string" || typeof next != "undefined") {
        throw new Error("ModuleUniverse constructor takes just a name")
      }

      this.name = name
      this.library = null
      this.modulePaths = null
      this.baseLog = null
      this.log = []
      this.waitingForReady = []
      this.waitingForStatement = []
      this.isWaiting = false
      this.isSaving = false
      this.isDirty = false
      this.quiet = false
      this.persistenceEngine == "offline"
    }

    ModuleUniverse.prototype.mute = function mute(value) {
      if (value === false) {
        this.quiet = false
      } else {
        this.quiet = true
      }
    }

    ModuleUniverse.prototype.builder = function() {
      return eval("("+this.source()+")")
    }

    var parents = 0

    ModuleUniverse.prototype.fork = function(newName) {
      parents++
      var parentName = "parent-"+parents
      var parent = new ModuleUniverse(parentName)
      parent.log = this.log
      parent.baseLog = this.baseLog
      parent.names = this.names
      parent.modulePaths = this.modulePaths

      var fork = new ModuleUniverse(newName)
      fork.baseLog = newBaseLog(this.names)
      fork.names = this.names
      fork.modulePaths = this.modulePaths
      fork.parent = parent

      this.baseLog = newBaseLog(this.names)
      this.log = []
      this.parent = parent

      return fork
    }

    ModuleUniverse.prototype.useLibrary = function(lib) {
      this.library = lib
    }

    function newBaseLog(names) {
      return eval("(function("+names.join(", ")+") {\n  // begin\n})")
    }

    ModuleUniverse.prototype.persistToS3 = function(options) {
      if (!options) {
        options = {
          key: process.env.AWS_ACCESS_KEY_ID,
          secret: process.env.AWS_SECRET_ACCESS_KEY,
          bucket: "ezjs"
        }
      }

      this.persistenceEngine = "s3"
      this.s3 = require("knox").createClient(options)
    }

    ModuleUniverse.prototype.isReady = function() {
      return !this.isWaiting
    }

    ModuleUniverse.prototype.load = function(callback) {

      switch(this.persistenceEngine) {
      case "offline":
        throw new Error("Can't load an offline universe")
        break;
      case "s3":
        this.loadFromS3(callback)
        break;
      default:
        throw new Error("How to load?")
      }

    }

    ModuleUniverse.prototype.writeToS3 = function() {
      var log = new Buffer(this.source())

      this.s3.putBuffer(
        log,
        this.path(),
        {"Content-Type": "text/plain"},
        handleS3WriteResponse.bind(this)
      )
    }

    function handleS3WriteResponse(error, response) {
      if (error) {
        throw new Error(error)
      }
      if (response) {
        response.pipe(process.stdout)
      }
      finishPersisting.call(this)
    }

    ModuleUniverse.prototype.loadFromS3 = function(callback) {

      if (!this.s3) {
        console.log("WARNING: No AWS credentials, no persistence. We are dust in the wind.")
        return
      }

      this.isWaiting = true

      this.baseLog = ""

      this.s3
      .get(this.path())
      .on("response", handleS3Response.bind(this))
      .end()
    }

    function call(fn) { fn() }

    function handleS3Response(response){
      response.setEncoding('utf8')
      response.on('data', appendS3Chunk.bind(this))
      response.on('end', finishS3Load.bind(this))
    }

    function appendS3Chunk(chunk){
      this.baseLog += chunk
    }

    function finishS3Load() {
      if (this.baseLog[0] == "<") {
        message = this.baseLog.match(/<Message>(.*)<\/Message>/)[1]
        console.log("Nothing in "+this.name+" yet. Amazon says "+message)
        this.baseLog = null
      } else {
        this.playItBack()
      }
      this.waitingForReady.forEach(call)
      this.waitingForReady = []
      this.isWaiting = false
    }

    ModuleUniverse.prototype.onReady =
      function(callback) {
        if (!this.isWaiting) {
          callback()
        } else {
          this.waitingForReady.push(callback)
        }
      }

    ModuleUniverse.prototype.playItBack = function(options) {

      if (this.wasPlayed && options && options.skipIfPlayed) {
        return
      } else if (this.wasPlayed) {
        throw new Error("Already played universe \""+this.name+"\"")
      }

      if (this.parent) {
        this.parent.playItBack({skipIfPlayed: true})
      }

      var lib = this.library || library

      var singletons = (options && options.singletons) || this.singletons

      if (!singletons) {
        var universe = this
        lib.using(
          this.modulePaths,
          function() {
            singletons = universe.singletons = arguments
          }
        )
      }

      this.info("\n===\nREPLAYING LOG "+this.name+"\n"+this.source()+"\n===\n")

      this.builder().apply(null, singletons)

      this.wasPlayed = true 
    }

    ModuleUniverse.prototype.markAsUnplayed = function() {
      this.wasPlayed = false      
    }

    ModuleUniverse.prototype.do =
      function(call) {
        var args = Array.prototype.slice.call(arguments, 1)
        var paramString = args.map(toString).join(", ")
        var line = call+"("+paramString+")"
        test(call, line)
        this.log.push(line)
        for(var i=0; i<this.waitingForStatement.length; i++) {
          this.waitingForStatement[i](call, args)
        }

        this.persist()
      }

    function toString(arg) {
      if (typeof arg == "undefined") {
        return "undefined"
      } else if (typeof arg == "function") {
        return arg.toString()
      } else {
        return JSON.stringify(arg)
      }
    }

    function noop() {}

    function test(call, line) {
      var parts = call.split(".")
      var method = parts[1]
      var argName = parts[0]

      if (method) {
        var singleton = {}
        singleton[method] = noop
      } else {
        var singleton = noop
      }

      var source = "(function("+argName+") { "+line+" })"

      try {
        var func = eval(source)

        func.call(null, singleton)
      } catch(e) {
        console.log("Log sanity check failed! We tried testing source:\n"+source)
        throw e
      }
    }

    ModuleUniverse.prototype.source = function() {
      if (typeof this.baseLog == "string") {
        var base = this.baseLog
      } else {
        var base = this.baseLog.toString()
      }

      var generator = base
        .replace(
          / +\/\/ begin/,
          "  "+this.log.join("\n  ")+"\n  // begin"
        )
        .replace(
          / *}$/,
          "}"
        )

      return generator
    }

    ModuleUniverse.prototype.path =
      function() {
        return "/universes/"+this.name+"/all.js"
      }

    ModuleUniverse.prototype.persist = function() {

      if (this.isSaving) {
        this.isDirty = true
        return
      }

      if (this.lastSave) {
        var sinceLastSave = new Date() - this.lastSave
        var timeToWait = 10000 - sinceLastSave
      } else {
        var timeToWait = 1000
      }

      this.isSaving = true

      setTimeout(
        persistNow.bind(this),
        timeToWait)
    }

    function persistNow() {

      this.isDirty = false
      this.lastSave = new Date()

      console.log("\n===\nNEW LOG for "+this.name+"\n"+this.source()+"\n===\n")

      switch(this.persistenceEngine) {
      case "offline":
        finishPersisting.call(this)
        break;
      case "s3":
        this.writeToS3()
      }
    }

    function finishPersisting() {
      this.isSaving = false
      if (this.isDirty) {
        this.persist()
      }
    }

    return aWildUniverseAppeared
  }
)