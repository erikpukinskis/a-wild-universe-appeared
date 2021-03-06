var library = require("module-library")(require)


module.exports = library.export(
  "a-wild-universe-appeared",[
  library.ref(),
  "identifiable"],
  function(lib, identifiable) {

    var cached = {}
    var signatures = {}
    var takenIds = {}

    function buildNewLog(name, pathsByName, baseLog) {

      if (typeof pathsByName != "object") {
        throw new Error("missing call log paths. Try new FunctionCall(\"some name\", {pathTo: singleton, etc...})")
      }

      var signature = pathsToSignature(pathsByName)

      if (cached[name]) {
        if (signature != signatures[name]) {
          throw new Error("Already created a universe called "+name+" but it has a different signature: "+signatures[name]+". You wanted to initialize a universe with this signature: "+signature)
        }

        return cached[name]
      }

      var universe = new FunctionCallLog(name, pathsByName, baseLog)

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

    function FunctionCallLog(name, pathsByName, baseLog) {

      var inConstructor = this instanceof FunctionCallLog

      if (!inConstructor) {
        return buildNewLog(name, pathsByName, baseLog)
      }

      this.name = name
      this.library = null
      this.pathsByName = pathsByName || null
      this.moduleIndexByName = {}

      this.names = []
      this.modulePaths = []

      for(var name in pathsByName) {
        var modulePath = pathsByName[name]
        this.moduleIndexByName[name] = this.modulePaths.length
        this.modulePaths.push(modulePath)
        this.names.push(name)
      }

      this.baseLog =  baseLog || newBaseLog(this.names)

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
      this.sockets = null

      var prefix = "uni"+(name || "")

      this.id = identifiable.assignId(takenIds, null, prefix)

      this.apply = this.apply.bind(this)

      takenIds[this.id] = true
    }

    function baseLogHasEntries(baseLog) {
      if (typeof baseLog == "function") {
        baseLog = baseLog.toString()
      }
      if (!baseLog) { return false }
      return !!baseLog.match(/  [a-zA-Z]/)
    }

    FunctionCallLog.prototype.getLastSyncMark = function() {
      return this.didSyncToMark
    }

    var lastMarkInteger = 1000*2000
    FunctionCallLog.prototype.mark = function(isGlobal) {
      lastMarkInteger++
      var prefix = isGlobal ? "glo-" : "loc-"
      var mark = prefix+lastMarkInteger.toString(36)
      this.marks[mark] = this.logEntries.length
      return mark
    }

    FunctionCallLog.prototype.markSynced = function(localMark, globalMark) {
      if (!globalMark) {
        throw new Error("server didn't mark sync point")
      }
      this.marks[globalMark] = this.marks[localMark]
      this.didSyncToMark = globalMark
    }

    FunctionCallLog.prototype.getStatements = function(fromMark, toMark) {
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

    FunctionCallLog.prototype.rewriteArguments = function(callPattern, argumentPosition, replacements) {

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

    FunctionCallLog.prototype.mute = function mute(value) {
      if (value === false) {
        this.quiet = false
      } else {
        this.quiet = true
      }
    }

    var parents = 0

    FunctionCallLog.prototype.fork = function(newName) {
      parents++
      var parentName = "parent-"+parents
      var parent = new FunctionCallLog(parentName)
      parent.logEntries = this.logEntries
      parent.baseLog = this.baseLog
      parent.names = this.names
      parent.modulePaths = this.modulePaths
      parent.pathsByName = this.pathsByName
      parent.singletons = this.singletons
      parent.moduleIndexByName = this.moduleIndexByName

      var fork = new FunctionCallLog(newName)
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

    FunctionCallLog.prototype.useLibrary = function(lib) {
      this.library = lib
    }

    function newBaseLog(names) {
      return eval("(function("+names.join(", ")+") {\n  // begin\n})")
    }

    FunctionCallLog.prototype.isReady = function() {
      return !this.isWaiting
    }

    FunctionCallLog.prototype.load = function(callback) {

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
      case "node":
        this.loadFromDisk(callback)
        break;
      default:
        throw new Error("How to load?")
      }

    }


    // Write to disk

    FunctionCallLog.prototype.persistToDisk = function() {
      if (!require) {
        throw new Error("Cannot persist to disk in the browser. Try universe.persistToLocalStorage")}
      this.persistenceEngine = "node"
      this.storage = require("fs")}

    FunctionCallLog.prototype.loadFromDisk = function(callback) {
      var log = this
      this.storage.readFile(
        "universe.log.js",
        "utf8",
        function(error, baseLog) {
          if (error) {
            console.log("Nothing found in universe.log.js!")}
          handleNewLog(log, baseLog)
        })}

    FunctionCallLog.prototype.writeToDisk = function() {
      this.storage.writeFile(
        "universe.log.js",
        this.source(),
        finishPersisting.bind(
          this))}



    // LocalStorage

    FunctionCallLog.prototype.persistToLocalStorage = function() {
      this.persistenceEngine = "localStorage"
      this.storage = window.localStorage
      if (!this.storage) {
        throw new Error("No localStorage support")
      }
    }

    FunctionCallLog.prototype.loadFromLocalStorage = function(callback) {
      var loaded = this.storage.getItem(this.path())
      if (loaded) {
        handleNewLog(this, loaded)
      } else {
        console.log("Nothing found in storage!")
      }
    }

    FunctionCallLog.prototype.writeToLocalStorage = function() {
      this.storage.setItem(this.path(), this.source())
      finishPersisting.call(this)
    }



    // S3

    FunctionCallLog.prototype.persistToS3 = function(options) {
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

    FunctionCallLog.prototype.writeToS3 = function() {
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

    FunctionCallLog.prototype.loadFromS3 = function(callback) {

      if (!this.s3) {
        console.log("WARNING: No AWS credentials, no persistence. We are dust in the wind.")
        return
      }

      this.isWaiting = true

      var finish = handleNewLog.bind(null, this)

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

    function handleNewLog(universe, baseLog) {
      if (baseLog) {
        universe.baseLog = baseLog
        universe.buildLinesFromBaseLog()
        universe.playItBack()
      }
      universe.waitingForReady.forEach(call)
      universe.waitingForReady = []
      universe.isWaiting = false
    }

    FunctionCallLog.prototype.onReady =
      function(callback) {
        if (!this.isWaiting) {
          callback()
        } else {
          this.waitingForReady.push(callback)
        }
      }

    FunctionCallLog.prototype.loadSingletonsFromCommonJS = function() {
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

    FunctionCallLog.prototype.playItBack = function(options) {

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
        null,
        callback)

      this.wasPlayed = true 
    }


    FunctionCallLog.prototype.builder = function() {
      return eval("("+this.source()+")")
    }

    FunctionCallLog.prototype.callFunctionsFrom = function(index, maxIndex, callback) {

      if (!this.baseLogEntries) {
        var entry = this.logEntries[index]
      } else if (index < this.baseLogEntries.length) {
        var entry = this.baseLogEntries[index]
      } else {
        var entry = this.logEntries[index - this.baseLogEntries.length]
      }

      if (!entry) {
        return }

      if (maxIndex && index > maxIndex) {
        return }

      callEntry(this, entry)

      if (callback) {
        var callNext = FunctionCallLog.prototype.callFunctionsFrom.bind(
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
      if (!parts) {
        throw new Error("universe log line <<<"+line+">>> is invalid")
      }
      var functionIdentifier = parts[1]
      var args = JSON.parse("["+parts[2]+"]")
      return buildEntry(functionIdentifier, args)
    }

    function buildEntry(functionIdentifier, args) {
      if (typeof functionIdentifier != "string") {
        throw new Error("universe statements need to have a function identifier string first. You passed "+ functionIdentifier)
      }
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

    FunctionCallLog.prototype.buildLinesFromBaseLog = function() {

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

    FunctionCallLog.prototype.getSingleton = function(name) {
      var path = this.pathsByName[name]
      if (typeof path != "string") {
        return path
      }
      var moduleIndex = this.moduleIndexByName[name]
      var singleton = this.singletons && this.singletons[moduleIndex]

      if (!singleton && this.parent) {
        return this.parent.getSingleton()
      }

      return singleton
    }

    FunctionCallLog.prototype.info = function() {
      if (this.quiet) { return }
      console.log.apply(console, arguments)
    }

    FunctionCallLog.prototype.markAsUnplayed = function() {
      this.wasPlayed = false      
    }

    FunctionCallLog.prototype.onStatement = function(callback) {
      this.waitingForStatement.push(callback)
    }

    FunctionCallLog.prototype.mirrorTo = function(singletons) {
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
      var paramString = ""
      entry.args.forEach(addParam)

      function addParam (arg, i) {
        try {
          var value = toString(arg)
          if (paramString) {
            paramString += ", "
          }
          paramString += value
        } catch(e) {
          throw new Error(i+"th argument to universe statement "+entry.functionIdentifier+" couldn't be turned into JSON: ", value)}}

      var line = entry.functionIdentifier+"("+paramString+")"

      return line
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

    FunctionCallLog.prototype.defineOn = function(bridge, aWildInBrowser) {
      return bridge.defineSingleton(
        "uni"+(this.id||"v"),[
        aWildInBrowser,
        this.name,
        this.pathsByName,
        this.builder()],
        function(aWildUniverseAppeared, name, pathsByName, builder) {
          var universe = aWildUniverseAppeared(
            name,
            pathsByName,
            builder)

          return universe
        })
    }

    FunctionCallLog.prototype.syncToSocket = function(socket, callback) {
      if (!callback) {
        throw new Error("universe.syncToSocket needs a callback: function(socketId, universe, data) that gets called when the socket returns a new log entry")
      }
      console.log("calling syncToSocket")

      // so here is where we ostensibly tell the universe that whatever comes out of that socket needs to get added to itself, and broadcast to any other clients.

      // Then this client wants to get any updates onStatement of the universe

      if (!this.sockets) {
        var sockets = this.sockets = []
      }

      if (socket.onClose) {
        socket.onClose(removeItem.bind(null, socket, this.sockets))
      }

      this.sockets.push(socket)

      console.log("Not doing anything onStatement? Maybe that's ok.\n")

      console.log("Here is where we are telling the socket what to do when it listens:")
      socket.listen(function(data) {
        callback(socket.id, this, data.functionIdentifier, data.args)})
    }

    function removeItem(item, items) {
      var i = items.indexOf(item)
      console.log("forgetting socket", item.id)
      if (i < 0) {
        return }
      items.splice(i, 1)
    }

    FunctionCallLog.prototype.broadcast = function(functionIdentifier, args) {
      console.log("should be some sockets to send to?", this.sockets && this.sockets.length)

      if (!this.sockets) {
        return }

      this.sockets.forEach(function(socket) {

        var message = JSON.stringify({
          functionIdentifier: functionIdentifier,
          args: args})

        socket.send(message)
      })
    }


    // FunctionCallLog.prototype.backfill = function(functionIdentifier, args) {

    //   var entry = buildEntry(
    //     functionIdentifier,
    //     args)

    //   test(entry)

    //   this.logEntries.push(entry)

    //   notifyStatementWaiters()
    // }

    FunctionCallLog.prototype.apply =
      function(functionIdentifier, args) {
      this.do.apply(
        this,[
        functionIdentifier]
        .concat(
          args))
    }

    FunctionCallLog.prototype.do =
      function(functionIdentifier) {
        var args = Array.prototype.slice.call(arguments, 1)

        // for(var i=0; i<args.length; i++) {
        //   if (typeof args[i] == "undefined") {
        //     throw new Error(i+"th arg to universe.do "+functionIdentifier+" was undefined.")
        //   }
        // }
        
        var entry = buildEntry(
          functionIdentifier,
          args)

        if (args[0] && args[0].DTRACE_NET_SERVER_CONNECTION) {
          throw new Error("very bad")
        }
        test(entry)

        this.logEntries.push(entry)

        this.notifyStatementWaiters(functionIdentifier, args)

        this.persist()
      }

    FunctionCallLog.prototype.notifyStatementWaiters = function(functionIdentifier, args) {
      for(var i=0; i<this.waitingForStatement.length; i++) {
        this.waitingForStatement[i](functionIdentifier, args)
      }}

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

    FunctionCallLog.prototype.source = function() {
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

    FunctionCallLog.prototype.path =
      function() {
        return "/universes/"+this.name+"/all.js"
      }

    FunctionCallLog.prototype.persist = function() {

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

    FunctionCallLog.prototype.persistNow = function() {

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
        break;
      case "node":
        this.writeToDisk(finishPersisting.bind)
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

    return FunctionCallLog
  }
)