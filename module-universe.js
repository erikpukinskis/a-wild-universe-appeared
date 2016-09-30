var library = require("nrtv-library")(require)

module.exports = library.export(
  "module-universe",
  ["knox"],
  function(knox) {

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
          this.moduleNames = arg
        } else {
          throw new Error("Don't know what to do with ModuleUniverse arg "+arg)
        }
      }

      this.log = []
      this.waitingForReady = []
      this.waiting = false
    }

    ModuleUniverse.prototype.persistToS3 = function(options) {
      this.s3 = knox.createClient(options)
    }

    ModuleUniverse.prototype.isReady = function() { return !this.waiting }

    ModuleUniverse.prototype.loadFromS3 = function(callback) {
      if (!this.s3) {
        console.log("WARNING: No AWS credentials, no persistence. We are dust in the wind.")
        return
      }

      this.waiting = true

      var universe = this
      var source = ""

      console.log("path", this.path())
      this.s3.get(this.path()).on('response',
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
          universe.play()
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

    ModuleUniverse.prototype.play
      = function() {
        (this.library || library).using(
          this.moduleNames,
          eval("("+this.source()+")")
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

    return ModuleUniverse
  }
)