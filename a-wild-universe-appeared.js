var library = require("module-library")(require)


module.exports = library.export(
  "a-wild-universe-appeared",[
  library.ref()],
  function(lib) {

    var cached = {}
    var signatures = {}

    function aWildUniverseAppeared(name, pathsByName, baseLog) {
      var universe = new ModuleUniverse(name)

      var signature = pathsToSignature(pathsByName)

      if (cached[name]) {
        if (signature != signatures[name]) {
          throw new Error("Already created a universe called "+name+" but it has a different signature: "+signatures[name]+". You wanted to initialize a universe with this signature: "+signature)
        }

        return cached[name]
      }

      var paths = []
      var names = []

      for(var name in pathsByName) {
        var modulePath = pathsByName[name]
        universe.moduleIndexByName[name] = paths.length
        paths.push(modulePath)
        names.push(name)
      }

      universe.baseLog = baseLog || newBaseLog(names)

      universe.pathsByName = pathsByName
      universe.modulePaths = paths
      universe.names = names
      universe.signature = signature

      cached[name] = universe
      signatures[name] = signature
      
      return universe
    }

    function pathsToSignature(obj) {
      var str = [];
      for(var p in obj)
        if (obj.hasOwnProperty(p)) {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      return str.join("&");
    }

    function ModuleUniverse(name, baseLog) {

      this.name = name
      this.library = null
      this.modulePaths = null
      this.pathsByName = null
      this.moduleIndexByName = {}
      this.baseLog = baseLog || null
      this.logEntries = []
      this.marks = {}
      this.didSyncToMark = null
      this.waitingForReady = []
      this.waitingForStatement = []
      this.isWaiting = false
      this.isSaving = false
      this.isDirty = false
      this.quiet = false
      this.persistenceEngine = "offline"
      this.singletons = null
      this.baseLogEntries = null
    }

    function baseLogHasEntries(baseLog) {
      if (typeof baseLog == "function") {
        baseLog = baseLog.toString()
      }
      if (!baseLog) { return false }
      return !!baseLog.match(/  [a-zA-Z]/)
    }

    ModuleUniverse.prototype.getLastSyncMark = function() {
      return this.didSyncToMark
    }

    var lastMarkInteger = 1000*2000
    ModuleUniverse.prototype.mark = function(isGlobal) {
      lastMarkInteger++
      var prefix = isGlobal ? "glo-" : "loc-"
      var mark = prefix+lastMarkInteger.toString(36)
      this.marks[mark] = this.logEntries.length
      return mark
    }

    ModuleUniverse.prototype.markSynced = function(localMark, globalMark) {
      if (!globalMark) {
        throw new Error("server didn't mark sync point")
      }
      this.marks[globalMark] = this.marks[localMark]
      this.didSyncToMark = globalMark
    }

    ModuleUniverse.prototype.getStatements = function(fromMark, toMark) {
      if (fromMark) {
        var fromIndex = this.marks[fromMark]
      } else {
        var fromIndex = 0
      }

      if (toMark) {
        var toIndex = this.marks[toMark]
      } else {
        var toIndex = this.logEntries.length
      }

      return this.logEntries.slice(fromIndex, toIndex)
    }

    ModuleUniverse.prototype.rewriteArguments = function(callPattern, argumentPosition, replacements) {

      var baseLength = callPattern.length - 2
      var anyMethod = callPattern.slice(baseLength, callPattern.length) == ".*"

      if (anyMethod) {
        var basePattern = callPattern.slice(0, baseLength)
      }

      function isMatch(entry) {
        if (basePattern && entry.functionIdentifier.slice(0, baseLength) != basePattern) {
          return false
        } else if (!basePattern && entry.functionIdentifier != callPattern) {
          return false
        }

        var currentValue = entry.args[argumentPosition]

        return replacements.hasOwnProperty(currentValue)
      }

      this.logEntries.forEach(
        function(entry) {
          if (!isMatch(entry)) {
            return
          }
          var currentValue = entry.args[argumentPosition]
          var newValue = replacements[currentValue]
          entry.args[argumentPosition] = newValue
        }
      )
    }

    ModuleUniverse.prototype.mute = function mute(value) {
      if (value === false) {
        this.quiet = false
      } else {
        this.quiet = true
      }
    }

    var parents = 0

    ModuleUniverse.prototype.fork = function(newName) {
      parents++
      var parentName = "parent-"+parents
      var parent = new ModuleUniverse(parentName)
      parent.logEntries = this.logEntries
      parent.baseLog = this.baseLog
      parent.names = this.names
      parent.modulePaths = this.modulePaths
      parent.pathsByName = this.pathsByName
      parent.singletons = this.singletons
      parent.moduleIndexByName = this.moduleIndexByName

      var fork = new ModuleUniverse(newName)
      fork.baseLog = newBaseLog(this.names)
      fork.names = this.names
      fork.modulePaths = this.modulePaths
      fork.modulePaths = this.modulePaths
      fork.pathsByName = this.pathsByName
      fork.singletons = this.singletons
      fork.moduleIndexByName = this.moduleIndexByName
      fork.parent = parent

      this.baseLog = newBaseLog(this.names)
      this.logEntries = []
      this.parent = parent

      return fork
    }

    ModuleUniverse.prototype.useLibrary = function(lib) {
      this.library = lib
    }

    function newBaseLog(names) {
      return eval("(function("+names.join(", ")+") {\n  // begin\n})")
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
      case "localStorage":
        this.loadFromLocalStorage(callback)
        break;
      default:
        throw new Error("How to load?")
      }

    }


    // LocalStorage

    ModuleUniverse.prototype.persistToLocalStorage = function() {
      this.persistenceEngine = "localStorage"
      this.storage = window.localStorage
      if (!this.storage) {
        throw new Error("No localStorage support")
      }
    }

    ModuleUniverse.prototype.loadFromLocalStorage = function(callback) {
      var loaded = this.storage.getItem(this.path())
      if (loaded) {
        this.baseLog = loaded
        this.playItBack()
      } else {
        console.log("Nothing found in storage!")
      }
    }

    ModuleUniverse.prototype.writeToLocalStorage = function() {
      this.storage.setItem(this.path(), this.source())
    }


    // S3

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

      var finish = handleNewLog.bind(this)

      var connect = concatenateChunks.bind(null, this.name, finish)

      this.s3
      .get(this.path())
      .on("response", connect)
      .end()
    }

    function call(fn) { fn() }

    function concatenateChunks(name, callback, response){
      var body = ""
      response.setEncoding('utf8')
      response.on('data', function(chunk) {
        body += chunk
      })
      response.on('end', function() {
        if (body[0] == "<") {
          var message = body.match(/<Message>(.*)<\/Message>/)[1]
          console.log("Nothing in "+name+" yet. Amazon says "+message)
          body = null
        }

        callback(body)
      })
    }

    function handleNewLog(baseLog) {
      if (baseLog) {
        this.baseLog = baseLog
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

    ModuleUniverse.prototype.loadSingletonsFromCommonJS = function() {
      var singletons = this.singletons = []
      var paths = this.modulePaths

      var universe = this
      this.names.forEach(function(name, i) {
        var path = paths[i]
        if (typeof path == "string") {
          (universe.library || lib).using(
            [path],
            function(singleton) {
              singletons[i] = singleton
            }
          )
        } else if (typeof path == "function") {
          singletons[i] = path
        }
      })      
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

      this.info("\n===\nREPLAYING LOG "+this.name+"\n"+this.source()+"\n===\n")

      var callback = options && options.callback

      if (!this.baseLogEntries && baseLogHasEntries(this.baseLog)) {
        throw new Error("Call universe.buildLinesFromBaseLog before universe.playItBack")}

      this.callFunctionsFrom(
        0,
        10, //this.functionCalls.length-1,
        callback)

      this.wasPlayed = true 
    }


    ModuleUniverse.prototype.builder = function() {
      return eval("("+this.source()+")")
    }

    ModuleUniverse.prototype.callFunctionsFrom = function(index, maxIndex, callback) {

      if (!this.baseLogEntries) {
        var entry = this.logEntries[index]
      } else if (index < this.baseLogEntries.length) {
        var entry = this.baseLogEntries[index]
      } else {
        var entry = this.logEntries[index - this.baseLogEntries.length]
      }

      if (!entry || index > maxIndex) {
        return }

      callEntry(this, entry)

      if (callback) {
        var callNext = ModuleUniverse.prototype.callFunctionsFrom.bind(
          this,
          index+1,
          maxIndex,
          callback)

        callback(
          entry.functionIdentifier,
          entry.args,
          callNext)}

      else {
        this.callFunctionsFrom(
          index+1,
          maxIndex)}}

    function buildEntryFromLine(line) {
      var parts = line.match(/^ *([^\(]*)\((.*)\)$/)
      var functionIdentifier = parts[1]
      var args = JSON.parse("["+parts[2]+"]")
      return buildEntry(functionIdentifier, args)
    }

    function buildEntry(functionIdentifier, args) {
      var functionParts = functionIdentifier.split(".")
      var singletonName = functionParts[0]
      var methodName = functionParts[1]

      return {
        functionIdentifier: functionIdentifier,
        singletonName: singletonName,
        methodName: methodName,
        args: args,
      }
    }

    ModuleUniverse.prototype.buildLinesFromBaseLog = function() {

      if (typeof this.baseLog == "function") {
        var baseLog = this.baseLog.toString()
      } else {
        var baseLog = this.baseLog
      }

      var lines = baseLog.split("\n")
      this.baseLogEntries = []

      for(var i = 1; i<lines.length-2; i++) {
        var line = lines[i]

        if (!line.trim()) {
          continue }

        this.baseLogEntries.push(
          buildEntryFromLine(
            line))}
    }

    function callEntry(universe, entry) {
      var singleton = universe.getSingleton(entry.singletonName)

      if (!singleton) {
        throw new Error("No singleton for statement "+entry.functionIdentifier)
      }

      if (entry.methodName) {
        singleton[entry.methodName].apply(singleton, entry.args)
      } else {
        singleton.apply(null, entry.args)
      }
    }

    ModuleUniverse.prototype.getSingleton = function(name) {
      var path = this.pathsByName[name]
      if (typeof path == "function") {
        return path
      }
      var moduleIndex = this.moduleIndexByName[name]
      var singleton = this.singletons && this.singletons[moduleIndex]

      if (!singleton && this.parent) {
        return this.parent.getSingleton()
      }

      return singleton
    }

    ModuleUniverse.prototype.info = function() {
      if (this.quiet) { return }
      console.log.apply(console, arguments)
    }

    ModuleUniverse.prototype.markAsUnplayed = function() {
      this.wasPlayed = false      
    }

    ModuleUniverse.prototype.onStatement = function(callback) {
      this.waitingForStatement.push(callback)
    }

    ModuleUniverse.prototype.mirrorTo = function(singletons) {
      if (this.singletons) {
        throw new Error("Already provided singletons to this universe")
      }

      this.singletons = singletons
      this.onStatement(runStatement.bind(this)) }

    function runStatement(functionIdentifier, args) {

      var parts = functionIdentifier.split(".")
      var variableName = parts[0]
      var methodName = parts[1]

      var path = this.pathsByName[variableName]
      var singleton = this.singletons[path]

      if (!singleton) {
        throw new Error("You never provided a "+path+" singleton. Try universe.mirrorTo({"+JSON.stringify(path)+": "+variableName+"})")
      }

      if (methodName) {
        singleton[methodName].apply(singleton, args)
      } else {
        singleton.apply(singleton, args)
      }
    }

    function entryToLine(entry) {
      var paramString = entry.args.map(toString).join(", ")
      var line = entry.functionIdentifier+"("+paramString+")"
      return line
    }

    ModuleUniverse.prototype.do =
      function(functionIdentifier) {
        var args = Array.prototype.slice.call(arguments, 1)

        if (!call) {
          throw new Error("no call")}

        var entry = buildEntry(
          functionIdentifier,
          args)

        test(entry)

        this.logEntries.push(entry)

        for(var i=0; i<this.waitingForStatement.length; i++) {
          this.waitingForStatement[i](functionIdentifier, args)
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

    function test(entry) {
      var parts = entry.functionIdentifier.split(".")
      var method = parts[1]
      var argName = parts[0]

      if (method) {
        var singleton = {}
        singleton[method] = noop
      } else {
        var singleton = noop
      }

      var line = entryToLine(entry)

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
          "  "+this.logEntries.map(entryToLine).join("\n  ")+"\n  // begin"
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

      if (this.persistenceEngine == "s3") {
        setTimeout(this.persistNow.bind(this), timeToWait)
      } else {
        this.persistNow()
      }
    }

    ModuleUniverse.prototype.persistNow = function() {

      this.isDirty = false
      this.lastSave = new Date()

      this.info("\n===\nNEW LOG for "+this.name+"\n"+this.source()+"\n===\n")

      switch(this.persistenceEngine) {
      case "offline":
        finishPersisting.call(this)
        break;
      case "s3":
        this.writeToS3()
        break;
      case "localStorage":
        this.writeToLocalStorage()
        finishPersisting.call(this)
        break;
      default:
        throw new Error("How to write "+this.persistenceEngine+"?")
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