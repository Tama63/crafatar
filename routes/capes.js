var networking = require("../modules/networking");
var logging = require("../modules/logging");
var helpers = require("../modules/helpers");
var config = require("../modules/config");
var router = require("express").Router();
var skins = require("../modules/skins");
var lwip = require("lwip");

/* GET skin request. */
router.get("/:uuid.:ext?", function (req, res) {
  var uuid = (req.params.uuid || "");
  var def = req.query.default;
  var start = new Date();
  var etag = null;

  if (!helpers.uuid_valid(uuid)) {
    res.status(422).send("422 Invalid UUID");
    return;
  }

  // strip dashes
  uuid = uuid.replace(/-/g, "");

  try {
    helpers.get_cape(uuid, function (err, hash, image) {
      logging.log(uuid);
      if (err) {
        logging.error(err);
      }
      etag = hash && hash.substr(0, 32) || "none";
      var matches = req.get("If-None-Match") == "\"" + etag + "\"";
      if (image) {
        var http_status = 200;
        if (matches) {
          http_status = 304;
        } else if (err) {
          http_status = 503;
        }
        logging.debug("Etag: " + req.get("If-None-Match"));
        logging.debug("matches: " + matches);
        logging.log("status: " + http_status);
        sendimage(http_status, image);
      } else {
        handle_default(404);
      }
    });
  } catch (e) {
    logging.error("Error!");
    logging.error(e);
    handle_default(500);
  }

  function handle_default(http_status) {
    if (def && def != "steve" && def != "alex") {
      res.writeHead(301, {
        "Cache-Control": "max-age=" + config.browser_cache_time + ", public",
        "Response-Time": new Date() - start,
        "X-Storage-Type": "downloaded",
        "Access-Control-Allow-Origin": "*",
        "Location": def
      });
      res.end();
    } else {
      def = def || skins.default_skin(uuid);
      lwip.open("public/images/" + def + "_skin.png", function (err, image) {
        image.toBuffer("png", function (err, buffer) {
          sendimage(http_status, buffer);
        });
      });
    }
  }

  function sendimage(http_status, image) {
    res.writeHead(http_status, {
      "Content-Type": "image/png",
      "Cache-Control": "max-age=" + config.browser_cache_time + ", public",
      "Response-Time": new Date() - start,
      "X-Storage-Type": "downloaded",
      "Access-Control-Allow-Origin": "*",
      "Etag": "\"" + etag + "\""
    });
    res.end(http_status == 304 ? null : image);
  }
});


module.exports = router;
