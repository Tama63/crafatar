var networking = require("./networking");
var logging = require("./logging");
var config = require("./config");
var cache = require("./cache");
var skins = require("./skins");
var renders = require("./renders");
var fs = require("fs");

// 0098cb60-fa8e-427c-b299-793cbd302c9a
var valid_uuid = /^([0-9a-f-A-F-]{32,36}|[a-zA-Z0-9_]{1,16})$/; // uuid|username
var hash_pattern = /[0-9a-f]+$/;

// gets the hash from the textures.minecraft.net +url+
function get_hash(url) {
  return hash_pattern.exec(url)[0].toLowerCase();
}

// downloads the images for +uuid+ while checking the cache
// status based on +details+. +whichhash+ specifies which
// image is more important, and should be called back on
// +callback+ contains the error buffer and image hash
function store_images(uuid, details, whichhash, callback) {
  networking.get_profile(uuid.length <= 16 ? null : uuid, function(err, profile) {
    if (err) {
      callback(err, null);
      return;
    }
    networking.get_skin_url(uuid, profile, function(skin_url) {
      networking.get_cape_url(uuid, profile, function(cape_url) {
        var urls = [skin_url, cape_url],
          hashes = {};
        for (i = 0; i < urls.length; i++) {
          var url = urls[i];
          (function(url) {
            logging.debug("URL: " + url);
            var raw_type = (url == skin_url ? "skin" : "cape");
            if (url != null) {
              var hash = get_hash(url);
              logging.debug("Type is: " + raw_type)
              var type = details != null ? (url == urls[0] ? details.skin : details.cape) : null;
              if (details && type == hash) {
                logging.log(uuid + " hash has not changed for " + raw_type);
                cache.update_timestamp(uuid, hash);
                if (whichhash == raw_type) {
                  callback(null, hash);
                }
              } else {
                logging.log(uuid + " new " + raw_type + " hash: " + hash);
                var verifypath = null;
                var facepath = null;
                var helmpath = null;
                if (raw_type == "skin") {
                  facepath = __dirname + "/../" + config.faces_dir + hash + ".png";
                  helmpath = __dirname + "/../" + config.helms_dir + hash + ".png";
                  verifypath = facepath;
                } else if (raw_type == "cape") {
                  verifypath = __dirname + "/../" + config.capes_dir + hash + ".png";
                }
                raw_type == "cape" ? hashes["cape"] = hash : hashes["skin"] = hash;
                if (fs.existsSync(verifypath)) {
                  logging.log(uuid + " " + raw_type + " already exists, not downloading");
                  if (whichhash == raw_type) {
                    callback(null, hash);
                  }
                } else {
                  if (raw_type == "skin") {
                    networking.get_from(skin_url, function(img, response, err) {
                      if (err || !img) {
                        if (raw_type == whichhash) {
                          callback(err, null);
                        }
                      } else {
                        skins.extract_face(img, verifypath, function(err) {
                          if (err) {
                            logging.error(err);
                            if (whichhash == raw_type) {
                              callback(err);
                            }
                          } else {
                            logging.log(uuid + " face extracted");
                            logging.debug(verifypath);
                            skins.extract_helm(verifypath, img, helmpath, function(err) {
                              logging.log(uuid + " helm extracted");
                              logging.debug(helmpath);
                              if (whichhash == raw_type) {
                                callback(err, hash);
                              }
                            });
                          }
                        });
                      }
                    });
                  } else if (raw_type == "cape") {
                    logging.debug("Cape url: " + cape_url)
                    networking.get_from(cape_url, function(img, response, err) {
                      logging.log(uuid + " downloaded cape");
                      if (err || !img) {
                        logging.error(err);
                        if (whichhash == raw_type) {
                          callback(err, null);
                        }
                      } else {
                        skins.save_image(img, verifypath, function(err) {
                          logging.log(uuid + " cape saved");
                          if (whichhash == raw_type) {
                            callback(err, hash);
                          }
                        });
                      }
                    });
                  }
                }
              }
            } else {
              if (whichhash == raw_type) {
                callback(null, null);
              }
            }
          })(url);
        }
        cache.save_hash(uuid, hashes["skin"], hashes["cape"]);
      });
    });
  });
};

var exp = {};

// returns true if the +uuid+ is a valid uuid or username
// the uuid may be not exist, however
exp.uuid_valid = function(uuid) {
  return valid_uuid.test(uuid);
};

// decides whether to get an image from disk or to download it
// callback contains error, status, hash
// the status gives information about how the image was received
//  -1: "error"
//   0: "none" - cached as null
//   1: "cached" - found on disk
//   2: "downloaded" - profile downloaded, skin downloaded from mojang servers
//   3: "checked" - profile re-downloaded (was too old), but it has either not changed or has no skin
exp.get_image_hash = function(uuid, raw_type, callback) {
  cache.get_details(uuid, function(err, details) {
    var type = (details != null ? (raw_type == "skin" ? details.skin : details.cape) : null);
    if (err) {
      callback(err, -1, null);
    } else {
      if (details && details.time + config.local_cache_time * 1000 >= new Date().getTime()) {
        // uuid known + recently updated
        logging.log(uuid + " uuid cached & recently updated");
        callback(null, (type ? 1 : 0), type);
      } else {
        if (details) {
          logging.log(uuid + " uuid cached, but too old");
        } else {
          logging.log(uuid + " uuid not cached");
        }
        store_images(uuid, details, raw_type, function(err, hash) {
          if (err) {
            callback(err, -1, details && type);
          } else {
            // skin is only checked (3) when uuid known AND hash didn't change
            // in all other cases the skin is downloaded (2)
            var status = details && (type == hash) ? 3 : 2;
            logging.debug(uuid + " old hash: " + (details && type));
            logging.log(uuid + " hash: " + hash);
            callback(null, status, hash);
          }
        });
      }
    }
  });
};


// handles requests for +uuid+ avatars with +size+
// callback contains error, status, image buffer, hash
// image is the user's face+helm when helm is true, or the face otherwise
// for status, see get_image_hash
exp.get_avatar = function(uuid, helm, size, callback) {
  logging.log("\nrequest: " + uuid);
  exp.get_image_hash(uuid, "skin", function(err, status, hash) {
    if (hash) {
      var facepath = __dirname + "/../" + config.faces_dir + hash + ".png";
      var helmpath = __dirname + "/../" + config.helms_dir + hash + ".png";
      var filepath = facepath;
      if (helm && fs.existsSync(helmpath)) {
        filepath = helmpath;
      }
      skins.resize_img(filepath, size, function(img_err, result) {
        if (img_err) {
          callback(img_err, -1, null, hash);
        } else {
          // we might have a hash although an error occured
          // (e.g. Mojang servers not reachable, using outdated hash)
          callback(err, (err ? -1 : status), result, hash);
        }
      });
    } else {
      // hash is null when uuid has no skin
      callback(err, status, null, null);
    }
  });
};

function get_type(helm, body) {
  var text = body ? "body" : "head";
  return helm ? text + "helm" : text;
};

// handles creations of skin renders
// callback contanis error, hash, image buffer
exp.get_render = function(uuid, scale, helm, body, callback) {
  logging.log(uuid + " render request");
  exp.get_image_hash(uuid, "skin", function(err, status, hash) {
    exp.get_skin(uuid, function(err, hash, img) {
      if (!hash) {
        callback(err, -1, hash, null);
        return;
      }
      var renderpath = __dirname + "/../" + config.renders_dir + hash + "-" + scale + "-" + get_type(helm, body) + ".png";
      if (fs.existsSync(renderpath)) {
        renders.open_render(renderpath, function(err, img) {
          callback(err, 1, hash, img);
        });
        return;
      }
      if (!img) {
        callback(err, 0, hash, null);
        return;
      }
      renders.draw_model(uuid, img, scale, helm, body, function(err, img) {
        if (err) {
          callback(err, -1, hash, null);
        } else if (!img) {
          callback(null, 0, hash, null);
        } else {
          fs.writeFile(renderpath, img, "binary", function(err) {
            if (err) {
              logging.log(err);
            }
            callback(null, 2, hash, img);
          });
        }
      });
    });
  });
};

// handles requests for +uuid+ skins
// callback contains error, hash, image buffer
exp.get_skin = function(uuid, callback) {
  logging.log(uuid + " skin request");
  exp.get_image_hash(uuid, "skin", function(err, status, hash) {
    var skinpath = __dirname + "/../" + config.skins_dir + hash + ".png";
    if (fs.existsSync(skinpath)) {
      logging.log("skin already exists, not downloading");
      skins.open_skin(skinpath, function(err, img) {
        callback(err, hash, img);
      });
      return;
    }
    networking.save_texture(uuid, hash, skinpath, function(err, response, img) {
      callback(err, hash, img);
    });
  });
};

// handles requests for +uuid+ capes
// callback contains error, hash, image buffer
exp.get_cape = function(uuid, callback) {
  logging.log(uuid + " cape request");
  exp.get_image_hash(uuid, "cape", function(err, status, hash) {
    if (!hash) {
      callback(err, null, null);
      return;
    }
    var capepath = __dirname + "/../" + config.capes_path + hash + ".png";
    if (fs.existsSync(capepath)) {
      logging.log("cape already exists, not downloading");
      skins.open_skin(capepath, function(err, img) {
        callback(err, hash, img);
      });
      return;
    }
    networking.save_texture(uuid, hash, capepath, function(err, response, img) {
      if (response && response.statusCode == 404) {
        callback(err, hash, null);
      } else {
        callback(err, hash, img);
      }
    });
  });
};

module.exports = exp;