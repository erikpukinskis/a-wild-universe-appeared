var test = require("nrtv-test")(require)

test.using(
  "can play events back",

  ["./", "./add"],
  function(expect, done, Universe, add) {

    var universe = new Universe(
      "test",
      ["./add"],
      function(add) {
        // begin
      }
    )

    // universe.persistToS3({
    //   key: process.env.AWS_ACCESS_KEY_ID,
    //   secret: process.env.AWS_SECRET_ACCESS_KEY,
    //   bucket: "ezjs"
    // })

    // universe.loadFromS3(
    //   function ready(){
    //   }
    // )

    universe.do("add", 1)
    universe.do("add", 4)

    universe.play()

    expect(add.total).to.equal(5)
    done()
  }
)
