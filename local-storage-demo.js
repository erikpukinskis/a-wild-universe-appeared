var library = require("module-library")(require)

library.using(
  [library.ref(), ".", "bridge-module", "web-host", "web-element"],
  function(lib, aWildUniverseAppeared, bridgeModule, host, element) {

    host.onRequest(function(getBridge) {
      var bridge = getBridge()

      var universe = bridge.defineSingleton(
        [bridgeModule(lib, "tell-the-universe", bridge)],
        function(aWildUniverseAppeared) {
          function who(name) {
            document.querySelector(".whos").innerHTML += "<br>"+"A who called "+name
          }

          var universe = aWildUniverseAppeared("whos", {who: who})

          universe.persistToLocalStorage()

          return universe
        }
      )

      bridge.domReady(
        [universe],
        function(universe) {
          universe.load()
        }
      )
      
      var addWho = bridge.defineFunction(
        [universe],
        function(universe) {
          var name = document.querySelector(".name").value
          universe.do("who", name)
        }
      )

      var page = element([
        element("input.name"),
        element("button", "Add who", {onclick: addWho.evalable()}),
        element("p.whos", "Previous whos:"),
      ])

      bridge.send(page)
    })
  }
)