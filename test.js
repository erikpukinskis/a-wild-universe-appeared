var runTest = require("run-test")(require)

runTest.only(
  "can provide singletons")


runTest(
  "can provide singletons",

  ["."],
  function(expect, done, aWildUniverseAppeared) {

    var count = 0
    function increment() { count++ }

    var universe = aWildUniverseAppeared("test", {
        increment: increment
      })

    universe.do("increment")
    universe.playItBack()
    expect(count).to.equal(1)
    
    done()
  }
)

runTest(
  "can play events back",

  ["./", "./add"],
  function(expect, done, aWildUniverseAppeared, add) {

    var universe = aWildUniverseAppeared("test", {
        add: "./add"
      })

    universe.useLibrary(runTest.library)

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

    var universe = aWildUniverseAppeared("test", {
        add: "./add"
      })

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

    orig.do("story", "new novel")
    orig.do("story.addLine", "new novel",     "It was a dark and stormy night.")
    orig.do("story.addLine", "new novel", "The maid screamed. A door slammed.")

    orig.playItBack()

    var novel = story.read("new novel")

    expect(novel).to.equal(
      "It was a dark and stormy night.\nThe maid screamed. A door slammed.")

    var fork = orig.fork("fancy")

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

