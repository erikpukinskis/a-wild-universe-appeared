var library = require("module-library")(require)

module.exports = library.export(
  "module-universe",
  ["knox"],
  function(knox) {

    var globalUniverse

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
      this.waiting = false
    }

    function callIt(name) {
      var universe = universeFor(this)
      universe.name = name
      return bindTo(universe)
    }

    function onLibrary(library) {
      var universe = universeFor(this)
      universe.library = library
      return bindTo(universe)
    }

    function withNames(pathsByName) {
      var universe = universeFor(this)

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
      return bindTo(universe)
    }

    function persistToS3(options) {
      var universe = universeFor(this)
      universe.s3 = knox.createClient(options)
    }

    function isReady() {
      var universe = universeFor(this)
      return !universe.waiting
    }

    function loadFromS3(callback) {
      var universe = universeFor(this)

      if (!universe.s3) {
        console.log("WARNING: No AWS credentials, no persistence. We are dust in the wind.")
        return
      }

      universe.waiting = true

      var source = ""

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
        if (source[0] == "<") {
          message = source.match(/<Message>(.*)<\/Message>/)[1]
          console.log("Nothing in "+universe.name+" yet. Amazon says "+message)
        } else {
          universe.baseLog = source
          playItBack.call(universe)
        }
        universe.waitingForReady.forEach(call)
        universe.waitingForReady = []
        universe.waiting = false
        callback()
      }

      function call(fn) { fn() }
    }

    ModuleUniverse.prototype.onReady =
      function(callback) {
        if (!this.waiting) {
          callback()
        } else {
          this.waitingForReady.push(callback)
        }
      }

    function playItBack() {
      var universe = universeFor(this)

      if (!universe.modulePaths) {
        debugger
      }

      if (!universe.source) {
        debugger
      }
      ;(universe.library || library).using(
        universe.modulePaths,
        eval("("+universe.source()+")")
      )
    }

    ModuleUniverse.prototype.do =
      function(call) {
        var args = Array.prototype.slice.call(arguments, 1)
        var paramString = args.map(JSON.stringify).join(", ")
        var line = call+"("+paramString+")"
        this.log.push(line)
        this.persist()
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

      var log = new Buffer(
        this.source()
      )

      console.log("\n===\nNEW LOG\n===\n"+this.source())

      if (!this.s3) { return }

      this.s3.putBuffer(
        log,
        this.path(),
        {"Content-Type": "text/plain"},
        handleResponse
      )

      function handleResponse(error, response) {
        if (error) {
          throw new Error(error)
        }
        response.pipe(process.stdout)
      }

    }

    return bindTo({universe: 1})
  }
)