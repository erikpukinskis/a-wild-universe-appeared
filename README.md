**tell-the-universe** logs simple function calls so they can be played back again.

```javascript
var tellTheUniverse = require("tell-the-universe")
```

Create a universe called "meals" that uses the npm module called "my-pantry":

```javascript
tellTheUniverse = tellTheUniverse.called("meals").withNames({"myPantry": "my-pantry"})
``

Sync it with S3:

```javascript
// Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables, then:
tellTheUniverse.load(function() {
  // log has been played back
})
```

Remember that a pantry existed:

```javascript
tellTheUniverse("myPantry", "eriks-pantry")
tellTheUniverse("myPantry.ingredient", "eriks-pantry", "paprika", "have")
tellTheUniverse("myPantry.ingredient", "eriks-pantry", "cocoa", "need")
```

## Why?

You can persist things by storing source files.

Data loading can be debugged using your normal software debugging tools.

The disk format for your data is human readable.

Logs can be trivially split up and recombined in interesting ways.
