var runTest = require("run-test")(require)


runTest(
  "constructor-style invocation",
  ["."],
  function(expect, done, FunctionCallLog) {
    var universe = new FunctionCallLog("hi", {})
    expect(universe.do).not.to.be.undefined
    done()
  })



runTest(
  "mirrorTo",
  ["."],
  function(expect, done, aWildUniverseAppeared) {

    var horses = []
    var sounds = []

    function horse(name) {
      horses.push(name)
    }
    horse.bray = function(sound) {
      sounds.push(sound)
    }

    var universe = aWildUniverseAppeared("equis", {horse: "a-horse"})
    universe.mute()

    universe.mirrorTo({"a-horse": horse})
    universe.do("horse", "Tim")
    universe.do("horse.bray", "NEeeehhh")

    expect(horses).to.deep.equal(["Tim"])
    expect(sounds).to.deep.equal(["NEeeehhh"])

    done()
  }
)


runTest(
  "onStatement",
  ["."],
  function(expect, done, aWildUniverseAppeared) {

    var universe = aWildUniverseAppeared("hellos", {})
    universe.mute()

    universe.onStatement(function(call, args) {
      expect(call).to.equal("hi")
      expect(args).to.deep.equal(["you"])
      done()
    })

    universe.do("hi", "you")
  }
)

runTest(
  "can provide singletons",

  ["."],
  function(expect, done, aWildUniverseAppeared) {

    var count = 0
    function increment() { count++ }

    var universe = aWildUniverseAppeared("increments", {
        increment: increment
      })
    universe.mute()

    universe.do("increment")

    universe.playItBack()
    expect(count).to.equal(1)
    
    done()
  }
)

runTest(
  "persist to file",
  ["./", "fs"],
  function(expect, done, aWildUniverseAppeared, fs) {
    var universe = aWildUniverseAppeared("test", {hi: null})
    universe.persistToDisk()
    universe.do("hi", "hobo")

    fs.readFile(
      "universe.log.js",
      "utf-8",
      function(error, data) {
        expect(data).to.match(/hobo/)
        fs.unlink(
          "universe.log.js",
          done)})
  })



runTest(
  "can play events back",

  ["./", "./add"],
  function(expect, done, aWildUniverseAppeared, add) {

    var universe = aWildUniverseAppeared("adding", {
        add: "./add"
      })
    universe.mute()

    universe.useLibrary(runTest.library)
    universe.loadSingletonsFromCommonJS()

    var testS3 = !!process.env.AWS_ACCESS_KEY_ID

    if (testS3) {
      universe.persistToS3({
        key: process.env.AWS_ACCESS_KEY_ID,
        secret: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: "ezjs"
      })
    }

    universe.do("add", 1)
    universe.do("add", 4)

    universe.markAsUnplayed()

    universe.playItBack()
    expect(add.total).to.equal(5)

    if (testS3) {
      universe.load(function ready(){
        expect(universe.isReady()).to.be.true
        done.ish("load from S3")
        done()
      })
    } else {
      done()
    }
  }
)

runTest(
  "undefined args",
  ["./"],
  function(expect, done, aWildUniverseAppeared) {

    var universe = aWildUniverseAppeared("more adding", {
        add: "./add"
      })
    universe.mute()
    universe.loadSingletonsFromCommonJS()

    universe.do("add", "foo", undefined)
    universe.markAsUnplayed()
    universe.playItBack()

    done()
  }
)



runTest.library.define(
  "story",
  function() {
    var stories = {}

    function story(title) {
      var x = {
        title: title,
        lines: []
      }
      stories[title] = x
    }

    story.fork = function(title, newTitle) {

      var y = {
        title: newTitle,
        lines: [],
        parent: title
      }

      stories[newTitle] = y

    }

    story.addLine = function(title, line) {
      if (!stories[title]) {
        throw new Error("No story called "+title)
      }
      stories[title].lines.push(line)
    }

    function lines(title) {
      var x = stories[title]
      if (x.parent) {
        return lines(x.parent).concat(x.lines)
      } else {
        return x.lines
      }
    }

    story.read = function (title) {
      if (!stories[title]) { return }
      return lines(title).join("\n")
    }

    story.reset = function() {
      console.log("....................................BOOM!")
      stories = {}
    }

    return story
  }
)

runTest(
  "forking",
  ["./", "story"],
  function(expect, done, aWildUniverseAppeared, story) {

    var orig = aWildUniverseAppeared(
      "original", {"story": "story"})
    orig.mute()

    orig.loadSingletonsFromCommonJS()

    orig.do("story", "new novel")
    orig.do("story.addLine", "new novel",     "It was a dark and stormy night.")
    orig.do("story.addLine", "new novel", "The maid screamed. A door slammed.")

    orig.playItBack()

    var novel = story.read("new novel")

    expect(novel).to.equal(
      "It was a dark and stormy night.\nThe maid screamed. A door slammed.")

    var fork = orig.fork("fancy")
    fork.mute()

    fork.do("story.fork", "new novel", "rewrite")

    fork.do("story.addLine", "rewrite", "Suddenly, a pirate ship appeared on the horizon!")

    orig.do("story.addLine", "new novel", "Kanye wept.")
    
    story.reset()
    orig.markAsUnplayed()

    fork.playItBack()

    var rewrite = story.read("rewrite")

    expect(rewrite).to.equal(
      "It was a dark and stormy night.\nThe maid screamed. A door slammed.\nSuddenly, a pirate ship appeared on the horizon!")

    var original = story.read("new novel")
    expect(original).not.to.contain("Kanye")

    orig.playItBack()
    var original = story.read("new novel")
    expect(original).to.contain("Kanye")

    done()
  }
)


runTest(
  "playback with a callback",
  ["."],
  function(expect, doneWithTest, aWildUniverseAppeared) {
    var string = ""
    function append(char) {
      string = string + char
    }

    var universe = aWildUniverseAppeared(
      "growing string",{
        append: append,
      })

    universe.do("append", "a")
    universe.do("append", "b")

    var inFirstCallback = true
    universe.playItBack({
      callback: function(statement, args, doneWithStatement) {
        if (inFirstCallback) {
          expect(string).to.equal("a")
          expect(statement).to.equal("append")
          expect(args).to.deep.equal(["a"])
          inFirstCallback = false

        } else {
          expect(string).to.equal("ab")
          expect(statement).to.equal("append")
          expect(args).to.deep.equal(["b"])

          doneWithTest()
        }
        doneWithStatement()
      }
    })
  }
)




