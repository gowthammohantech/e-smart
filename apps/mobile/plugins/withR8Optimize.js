const { AndroidConfig, withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

/**
 * Turns on R8 full optimisation for release builds, as Play Console
 * recommends. AGP 9 does this by default, but React Native still pins
 * AGP 8.x, so we switch to the optimising ProGuard defaults and opt in to
 * optimised resource shrinking ourselves. Drop this plugin once the
 * template ships AGP 9.
 */
const PLAIN_DEFAULTS = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZE_DEFAULTS = 'getDefaultProguardFile("proguard-android-optimize.txt")';

function withR8Optimize(config) {
  config = withAppBuildGradle(config, (cfg) => {
    const { contents } = cfg.modResults;
    if (contents.includes(OPTIMIZE_DEFAULTS)) return cfg;
    if (!contents.includes(PLAIN_DEFAULTS)) {
      throw new Error(
        'withR8Optimize: the app build.gradle proguardFiles line changed shape; update the pattern in plugins/withR8Optimize.js.',
      );
    }
    cfg.modResults.contents = contents.replace(PLAIN_DEFAULTS, OPTIMIZE_DEFAULTS);
    return cfg;
  });

  return withGradleProperties(config, (cfg) => {
    cfg.modResults = AndroidConfig.BuildProperties.updateAndroidBuildProperty(
      cfg.modResults,
      'android.r8.optimizedResourceShrinking',
      'true',
    );
    return cfg;
  });
}

module.exports = withR8Optimize;
