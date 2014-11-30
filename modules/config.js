var config = {
  min_size: 1,               // < 1 will (obviously) cause crash
  max_size: 512,             // too big values might lead to slow response time or DoS
  default_size: 160,         // size to be used when no size given
  local_cache_time: 30,      // seconds until we will check if the image changed. should be > 60 to prevent mojang 429 response
  browser_cache_time: 30,    // seconds until browser will request image again
  http_timeout: 3000,        // ms until connection to mojang is dropped
  cleaning_interval: 3000,      // ms interval: deleting images if disk size at limit
  cleaning_limit: 10240,     // minumum required available KB on disk to trigger cleaning
  cleaning_amount: 50000,    // amount of avatar (and their helm) files to clean
  faces_dir: "skins/faces/", // directory where faces are kept. should have trailing "/"
  helms_dir: "skins/helms/", // directory where helms are kept. should have trailing "/"
  debug_enabled: true        // enables logging.debug
};

module.exports = config;