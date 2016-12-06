var tellTheUniverse = require("./")


// is-everyone-free
// a-story
// tell-the-universe
// someone-is-a-person
// we-have-people-to-talk-to

tellTheUniverse(
  "a-story",
  "is-everyone-free",
  ["web-element", "browser-bridge", "web-site", "tell-browser", "tell-the-universe"],
  function aVeryDeepDankSpell() {
  }
)

tellTheUniverse(
  "a-story",
  "tell-the-universe",
  ["knox"],
  function(knox) {
    // ...
  }
)

tellTheUniverse(
  "a-story",
  "a-story",
  ["browser-bridge"],
  function(bridge, functionCall, makeItEditable) {


  }
)

function someoneIsAPerson(number) {
  var person = new Person(number)
  person.text("you are a person!")

  setTimeout(function() {
    person.text("i am a phone number.")
  }, 5000)

  person.listen(
    function(message) {
      socketToErik.send({
        smsNeedsResponse: message})
    }
  )
}

var socketToErik = new SingleUseSocket()

var page = [
  element("someone's phone number"),
  element("input.persons-number", {placeholder: "number goes here"}),
  element("button", "they are a person")
]

bridge.asap(
  [socketToErik.defineListenOn(bridge)],
  function(getMessage) {
    getMessage(function(message) {
      alert("Someone needs something! "+message)
    })
  }
)

webSite.addRoute("get", "/", bridge.sendPage(page))

webSite.addRoute("post", "/people", function(request, response) {
  someoneIsAPerson(request.body.number)
  tellTheUniverse(
    "someoneIsAPerson",
    request.body.number
  )
})

// print f “marigolds wave in the sun, saying hello while wondering where the bees buzz”

site.start(process.env.PORT)
