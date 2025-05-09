const express = require('express');
const path    = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Static files from /static
app.use(
  express.static(path.join(__dirname, 'static'), {
    // if someone requests a file that isn't there, 
    // leave it to the 404 handler below
    fallthrough: true
  })
);

// Any request for a .js/.css/.png/etc that wasn't found → 404
app.use((req, res, next) => {
  if (path.extname(req.path)) {
    return res.status(404).sendFile(
      path.join(__dirname, 'static', '404.html')
    );
  }
  next();
});

// All other GETs → your SPA's index.html
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// Start up
app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
