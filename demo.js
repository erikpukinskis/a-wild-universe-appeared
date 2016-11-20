
tellTheUniverse(
  "it-is-so",
  function(tellTheUniverse) {

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

    tellTheUniverse(
      "a-story",
      "someone-is-a-person"
      ["sms-person"],
      function(Person) {

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

        return someoneIsAPerson

      }
    )




    tellTheUniverse(
      "we-have-people-to-talk-to",
      ["web-element", "web-site"],
      function(element, webSite) {

        var page = [
          element("someone's phone number"),
          element("input.persons-number", {placeholder: "number goes here"}),
          element("button", "they are a person")
        ]

        webSite.addRoute("get", "/", bridge.sendPage(page))

        webSite.addRoute("post", "/people", function(request, response) {
          someoneIsAPerson(request.body.number)
          tellTheUniverse(
            "someoneIsAPerson",
            request.body.number
          )
        })

        site.start(process.env.PORT)
      }
    )


  }
)
