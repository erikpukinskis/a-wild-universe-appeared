
var aWildUniverseAppeared = require(".")

universe = aWildUniverseAppeared("meals", {"myPantry": "my-pantry"})

universe.mute()

universe.do("myPantry", "eriks-pantry")
universe.do("myPantry.ingredient", "eriks-pantry", "paprika", "have")
universe.do("myPantry.ingredient", "eriks-pantry", "cocoa", "need")

console.log(universe.source())



// I want to be able to type this shit on my phone:

aWildUniverseAppeared(
  "chickens",
  function() {
    "capture single pixel"
    "tap it"
    "press to grow square"
    "drag to move destination; slow to grow destination segment"
    "that's a seed"
    "it waves up and down but doesn't move"

    "add a 2nd dimension to it, right left, and you can attract it to the right attractor or left attractor. if you time it when the seed is above ground, you will be able to stay aloft for multiple pumps of the seed, allowing you to travel longer distances"

    "drag out another segment (up from the neck), and"
    "change direction substantially to add a beak"
    "change direction slowly and consistently to add a curve"
    "because it is off the ground, it can see, it rotates, and it has its own brain"

    "tap a segment to train primarily in that brain"

    "direct the bottom attention left and right to get some air, then direct the top attention to the seed"

    "when it gets to the seed, the beak eats, and all of the neurons get rewarded. The neurons are just fourier components that have been rewared. Over time a new layer of neurons grows below."

    "fourier components are constantly auditioned, and if they match the tapping better than average, they have a slower decay"
  }
)


aWildUniverseAppeared(
  "some-eriks",
  function eriks(issueBond, sellBond) {
    var bond = issueBond(
      "Erik is sane"
    )

    bond.addTasks([
      "pay taxes",
    ])

    bond.addExpense(
      "rent",
      "$500"
    )

    return sellBond(bond)
  }
)

aWildUniverseAppeared(
  "panel-bond",
  function freeMoneyBonds(issueBond, sellBond) {
    var bond = issueBond(
      "floor panel",
      {"rateOfReturn": "10%",  "termLength": "60 days"}
    )

    bond.addTasks([
      "cut studs to length",
      "cut track to length",
      "crimp",
      "add sheathing",
      "flipsulate",
      "add sheathing",
    ])

    bond.addExpense(
      "labor",
      "$100"
    )
    bond.addExpense(
      "steel studs",
      "$20"
    )
    bond.addExpense(
      "plywood",
      "$10"
    )

    return sellBond(bond)
  }
)

aWildUniverseAppeared(
  "bonds",
  function capitalismBruh(webHost, showSource) {

    webHost.onVoxel(function(voxel) {
      voxel("panel-bond")

      voxel(
        function(showSource) {
          showSource("panel-bond")
        }
      )

      voxel("some-eriks-appeared")
        // This NPM package pledges to follow the concerns of all Eriks, including avatar services, collective representation, etc. It follows the rules of the Name Package Constitution

      voxel("name-package-constitution")

      voxel("chickens")
    })

  }
)

