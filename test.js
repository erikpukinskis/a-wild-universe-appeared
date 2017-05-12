var runTest = require("run-test")(require)

runTest.only("forking")

runTest.library.define(
  "a",
  [runTest.library.ref()],
  function(lib) {

    function a(x) {
      this.store.push(x)
    }

    function getAll() {
      return this.store
    }

    function bind(context) {
      var top = a.bind(context)
      top.getAll = getAll.bind(context)
      return top
    }

    return lib.generator(function() {
      return bind({
        store: []
      })
    })
  }
)



runTest(
  "can play events back",

  ["./", "./add"],
  function(expect, done, tellTheUniverse, add) {

    tellTheUniverse = tellTheUniverse
      .called("test")
      .withNames({
        add: "./add"
      })
      .onLibrary(runTest.library)

    var testS3 = !!process.env.AWS_ACCESS_KEY_ID

    if (testS3) {
      tellTheUniverse.persistToS3({
        key: process.env.AWS_ACCESS_KEY_ID,
        secret: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: "ezjs"
      })
    }

    tellTheUniverse("add", 1)
    tellTheUniverse("add", 4)

    tellTheUniverse.playItBack()
    expect(add.total).to.equal(5)

    if (testS3) {
      tellTheUniverse.loadFromS3(
        function ready(){
          expect(tellTheUniverse.isReady()).to.be.true
          done.ish("load from S3")
          done()
        }
      )
    } else {
      done()
    }
  }
)

runTest(
  "undefined args",
  ["./"],
  function(expect, done, tellTheUniverse) {


    tellTheUniverse = tellTheUniverse
      .called("test")
      .withNames({
        add: "./add"
      })

    tellTheUniverse("add", "foo", undefined)

    tellTheUniverse.playItBack()

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
  function(expect, done, tellTheUniverse, story) {

    var orig = tellTheUniverse.called(
      "original").withNames({"story": "story"})

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

