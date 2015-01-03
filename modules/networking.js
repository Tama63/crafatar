var logging = require("./logging");
var request = require("request");
var config = require("./config");
var skins = require("./skins");
var fs = require("fs");

var session_url = "https://sessionserver.mojang.com/session/minecraft/profile/";
var skins_url = "https://skins.minecraft.net/MinecraftSkins/";
var capes_url = "https://skins.minecraft.net/MinecraftCloaks/";

var exp = {};

// exracts the skin url of a +profile+ object
// returns null when no url found (user has no skin)
exp.extract_skin_url = function(profile) {
  var url = null;
  if (profile && profile.properties) {
    profile.properties.forEach(function(prop) {
      if (prop.name == "textures") {
        var json = Buffer(prop.value, "base64").toString();
        var props = JSON.parse(json);
        url = props && props.textures && props.textures.SKIN && props.textures.SKIN.url || null;
      }
    });
  }
  return url;
}

// exracts the cape url of a +profile+ object
// returns null when no url found (user has no cape)
exp.extract_cape_url = function(profile) {
  var url = null;
  if (profile && profile.properties) {
    profile.properties.forEach(function(prop) {
      if (prop.name == "textures") {
        var json = Buffer(prop.value, "base64").toString();
        var props = JSON.parse(json);
        url = props && props.textures && props.textures.CAPE && props.textures.CAPE.url || null;
      }
    });
  }
  return url;
}

// makes a GET request to the +url+
// +options+ hash includes various options for
// encoding and timeouts, defaults are already
// specified. +callback+ contains the body, response,
// and error buffer. get_from helper method is available
exp.get_from_options = function(url, options, callback) {
  request.get({
    url: url,
    headers: {
      "User-Agent": "https://crafatar.com"
    },
    timeout: options["timeout"] || config.http_timeout,
    encoding: options["encoding"] || null,
    followRedirect: options["followRedirect"] || false
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      // skin_url received successfully
      logging.log(url + " url received");
      callback(body, response, error);
    } else if (error) {
      callback(error, response, null);
    } else if (response.statusCode == 404) {
      // skin (or user) doesn't exist
      logging.log(url + " url does not exist");
      callback(null, response, null);
    } else if (response.statusCode == 429) {
      // Too Many Requests
      // Never got this, seems like skins aren't limited
      logging.warn(body || "Too many requests");
      callback(null, response, null);
    } else {
      logging.error(url + " Unknown error:");
      //logging.error(response);
      callback(body || "Unknown error", response, null);
    }
  });
};

// helper method for get_from_options, no options required
exp.get_from = function(url, callback) {
  exp.get_from_options(url, {}, function(body, response, err) {
    callback(body, response, err);
  });
};

// specifies which numbers identify what url
var mojang_url_types = {
  1: skins_url,
  2: capes_url
};

// make a request to skins.miencraft.net
// the skin url is taken from the HTTP redirect
// type 1 is skins, type 2 is capes
var get_username_url = function(name, type, callback) {
  exp.get_from(mojang_url_types[type] + name + ".png", function(body, response, err) {
    if (!err) {
      callback(err, response ? (response.statusCode == 404 ? null : response.headers.location) : null);
    } else {
      callback(err, null);
    }
  })
};

// gets the URL for a skin/cape from the profile
// +type+ specifies which to retrieve
var get_uuid_url = function(profile, type, callback) {
  if (type == 1) {
    callback(exp.extract_skin_url(profile));
  } else if (type == 2) {
    callback(exp.extract_cape_url(profile));
  }
};

// make a request to sessionserver
// profile is returned as json
exp.get_profile = function(uuid, callback) {
  if (uuid == null) {
    callback(null, null);
  } else {
    exp.get_from(session_url + uuid, function(body, response, err) {
      callback(err, JSON.parse(body));
    }); 
  }
};

// todo remove middleman

// +uuid+ is likely a username and if so
// +uuid+ is used to get the url, otherwise
// +profile+ will be used to get the url
exp.get_skin_url = function(uuid, profile, callback) {
  if (uuid.length <= 16) {
    //username
    get_username_url(uuid, 1, function(err, url) {
      callback(url);
    });
  } else {
    get_uuid_url(profile, 1, function(url) {
      callback(url);
    });
  }
};

// +uuid+ is likely a username and if so
// +uuid+ is used to get the url, otherwise
// +profile+ will be used to get the url
exp.get_cape_url = function(uuid, profile, callback) {
  if (uuid.length <= 16) {
    //username
    get_username_url(uuid, 2, function(err, url) {
      callback(url);
    });
  } else {
    get_uuid_url(profile, 2, function(url) {
      callback(url);
    });
  }
};

// downloads skin file from +url+
// callback contains error, image
exp.get_skin = function(url, callback) {
  exp.get_from(url, response, function(body, err) {
    callback(body, err);
  });
};

exp.save_skin = function(uuid, hash, outpath, callback) {
  if (hash) {
    var skinurl = "http://textures.minecraft.net/texture/" + hash;
    exp.get_from(skinurl, function(img, response, err) {
      if (err) {
        logging.error("error while downloading skin");
        callback(err, null);
      } else {
        fs.writeFile(outpath, img, "binary", function(err) {
          if (err) {
            logging.log(err);
          }
          callback(null, img);
        });
      }
    });
  } else {
    callback(null, null);
  }
};

exp.get_cape = function(url, callback) {
  exp.get_from(url, function(body, response, err) {
    callback(err, body);
  });
};

module.exports = exp;
