var library = require("module-library")(require)

module.exports = library.export(
  "tell-the-universe",
  ["knox"],
  function(knox) {

    var globalUniverse
    var isOffline = true

    function universeFor(reference) {
      if (reference.DTRACE_NET_SERVER_CONNECTION) {
        throw new Error("bound universe function to global scope")
      }
      if (reference.universe == 1) {
        var universe = globalUniverse || newGlobalUniverse()
      } else {
        var universe = reference
      }

      return universe
    }

    function newGlobalUniverse() {
      globalUniverse = new ModuleUniverse()
      return globalUniverse
    }

    function tellTheUniverse() {
      var universe = universeFor(this)

      if (!universe.baseLog) {
        var name = universe.name
        name = name && name+" " || ""

        throw new Error("Can't tell the universe "+name+"anything if it doesn't know what words you speak with! Try tellTheUniverse = tellTheUniverse.called(\"whatever\").withNames({someName: \"path-to-some-module\"})")
      }

      universe.do.apply(universe, arguments)
    }

    function bindTo(universe) {
      var tellIt = tellTheUniverse.bind(universe)
      tellIt.withNames = withNames.bind(universe)
      tellIt.called = callIt.bind(universe)
      tellIt.persistToS3 = persistToS3.bind(universe)
      tellIt.loadFromS3 = loadFromS3.bind(universe)
      tellIt.playItBack = playItBack.bind(universe)
      tellIt.onLibrary = onLibrary.bind(universe)
      tellIt.isReady = isReady.bind(universe)
      tellIt.load = load.bind(universe)
      tellIt.onAllReady = onAllReady

      return tellIt
    }


    function ModuleUniverse() {
      for(var i=0; i<arguments.length; i++) {
        var arg = arguments[i]

        if (typeof arg == "string") {
          this.name = arg
        } else if (typeof arg == "function") {
          this.baseLog = arg
        } else if (arg.constructor.name == "Library") {
          this.library = arg
        } else if (Array.isArray(arg)) {
          this.modulePaths = arg
        } else {
          throw new Error("Don't know what to do with ModuleUniverse arg "+arg)
        }
      }

      this.log = []
      this.waitingForReady = []
      this.isWaiting = false
      this.isSaving = false
      this.isDirty = false
    }

    var universesByName = {}

    function callIt(name) {
      var named = universesByName[name]

      if (named) {
        return bindTo(named)
      }
      
      var universe = universesByName[name] = new ModuleUniverse()
      universe.name = name
      return bindTo(universe)
    }

    function onLibrary(lib) {
      if (!lib) {
        throw new Error()
      }
      var universe = universeFor(this)
      universe.library = lib
      return bindTo(universe)
    }

    function withNames(pathsByName) {
      var universe = universeFor(this)
      var signature = JSON.stringify(pathsByName)

      if (universe.signature && signature != universe.signature) {
        throw new Error("Trying to use names "+signature+" on universe "+universe.name+" but it was already using names "+universe.signature)
      }

      var paths = []
      var names = []

      for(var name in pathsByName) {
        var modulePath = pathsByName[name]
        paths.push(modulePath)
        names.push(name)
      }

      var logScript = "(function("+names.join(", ")+") {\n  // begin\n})"

      var baseLog = eval(logScript)
      universe.baseLog = baseLog
      universe.modulePaths = paths
      universe.signature = signature

      return bindTo(universe)
    }

    ModuleUniverse.prototype.persistToS3 = persistToS3

    function persistToS3(options) {
      var universe = universeFor(this)
      universe.s3 = knox.createClient(options)
    }

    function isReady() {
      var universe = universeFor(this)
      return !universe.isWaiting
    }

    function load(callback) {
      var universe = universeFor(this)

      if (process.env.AWS_ACCESS_KEY_ID) {
        isOffline = false

        universe.persistToS3({
          key: process.env.AWS_ACCESS_KEY_ID,
          secret: process.env.AWS_SECRET_ACCESS_KEY,
          bucket: "ezjs"
        })

        universe.loadFromS3(callback)
      } else {
        console.log("I have no Amazon credentials. There is nothing to load in the universe.")
      }
    }

    ModuleUniverse.prototype.loadFromS3 = loadFromS3

    var waitingForAll = []
    var loadingCount = 0
    function onAllReady(callback) {
      if (loadingCount == 0) {
        callback()
      } else {
        waitingForAll.push(callback)
      }
    }

    function loadFromS3(callback) {
      var universe = universeFor(this)

      if (!universe.s3) {
        console.log("WARNING: No AWS credentials, no persistence. We are dust in the wind.")
        return
      }

      universe.isWaiting = true

      var source = ""

      loadingCount++
      universe.s3.get(universe.path()).on('response',
        function(res){
          res.setEncoding('utf8')
          res.on('data', append)
          res.on('end', done)
        }
      ).end()

      function append(chunk){
        source += chunk
      }
     

      function done() {
        loadingCount--
        if (source[0] == "<") {
          message = source.match(/<Message>(.*)<\/Message>/)[1]
          console.log("Nothing in "+universe.name+" yet. Amazon says "+message)
        } else {
          universe.baseLog = source
          playItBack.call(universe)
        }
        universe.waitingForReady.forEach(call)
        universe.waitingForReady = []
        universe.isWaiting = false
        callback && callback()
        if (loadingCount == 0) {
          waitingForAll.map(call)
          waitingForAll = []
        }
      }

      function call(fn) { fn() }
    }

    ModuleUniverse.prototype.onReady =
      function(callback) {
        if (!this.isWaiting) {
          callback()
        } else {
          this.waitingForReady.push(callback)
        }
      }

    function playItBack() {
      var universe = universeFor(this)

      ;(universe.library || library).using(
        universe.modulePaths,
        eval("("+universe.source()+")")
      )

      console.log("\n===\nREPLAYED LOG\n"+universe.source()+"\n===\n")
    }

    ModuleUniverse.prototype.do =
      function(call) {
        var args = Array.prototype.slice.call(arguments, 1)
        var paramString = args.map(toString).join(", ")
        var line = call+"("+paramString+")"
        test(call, line)
        this.log.push(line)
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

    ModuleUniverse.prototype.source =
      function() {
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
      var log = new Buffer(
        this.source()
      )

      this.isDirty = false
      this.lastSave = new Date()

      console.log("\n===\nNEW LOG\n"+this.source()+"\n===\n")

      if (isOffline) {
        handleResponse.call(this)
      } else {
        this.s3.putBuffer(
          log,
          this.path(),
          {"Content-Type": "text/plain"},
          handleResponse.bind(this)
        )
      }
    }

    function handleResponse(error, response) {
      if (error) {
        throw new Error(error)
      }
      this.isSaving = false
      if (this.isDirty) {
        this.persist()
      }
      if (response) {
        response.pipe(process.stdout)
      }
    }

    return bindTo({universe: 1})
  }
)