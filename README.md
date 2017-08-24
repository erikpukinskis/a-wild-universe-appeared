**tell-the-universe** logs simple function calls so they can be played back again.

```javascript
var aWildUniverseAppeared = require("tell-the-universe")
```

Create a universe called "meals" that uses the npm module called "my-pantry":

```javascript
universe = aWildUniverseAppeared("meals", {"myPantry": "my-pantry"})
```

Sync it with S3:

```javascript
universe.persistToS3({
  key: process.env.AWS_ACCESS_KEY_ID,
  secret: process.env.AWS_SECRET_ACCESS_KEY,
  bucket: process.env.S3_BUCKET
})
universe.load(function() {
  // log has been played back
})
```

Remember that a pantry existed:

```javascript
universe.do("myPantry", "eriks-pantry")
universe.do("myPantry.ingredient", "eriks-pantry", "paprika", "have")
universe.do("myPantry.ingredient", "eriks-pantry", "cocoa", "need")
```

## Why?

You can persist things by storing source files.

Data loading can be debugged using your normal software debugging tools.

The disk format for your data is human readable.

Logs can be trivially split up and recombined in interesting ways.

You can easily set up test fixtures just by copying and pasting production logs into tests.

## Why it's amazing

Whenever you persist data, it logs the logs out to the console, so you can copy test data that results from your interaction into your demo code.

That makes it super easy to construct test cases that you can use while you are iterating your code:

![screenshot of source code logged to the console, copied into a demo source file](paste-universe.gif)

That makes it much less likely that you'll need a production database on your development machine.

It also makes it much easier to test submodules independently of your app. You can just do something in your main app, copy out a resulting micro universe, and use it in a demo of the submodule.
