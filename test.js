var runTest = require("run-test")(require)

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
