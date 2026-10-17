const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs release builds with the Play upload key. The keystore and its
 * passwords live in `credentials/` (gitignored) as `elixir-upload.keystore`
 * and `android-signing.properties`; without them, release builds stay
 * signed with the debug key as the template ships.
 */
const PROPS_PATH = '../credentials/android-signing.properties';

const RELEASE_SIGNING = `
        release {
            def signingFile = rootProject.file('${PROPS_PATH}')
            if (signingFile.exists()) {
                def signing = new Properties()
                signingFile.withInputStream { signing.load(it) }
                storeFile rootProject.file("../credentials/\${signing['storeFile']}")
                storePassword signing['storePassword']
                keyAlias signing['keyAlias']
                keyPassword signing['keyPassword']
            }
        }`;

const DEBUG_SIGNING = /(signingConfigs \{\n\s*debug \{[\s\S]*?\n\s{8}\})/;
const RELEASE_USES_DEBUG =
  /(release \{\n(?:\s*\/\/.*\n)*\s*signingConfig )signingConfigs\.debug/;

function withAndroidSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let { contents } = cfg.modResults;
    if (contents.includes(PROPS_PATH)) return cfg;
    if (!DEBUG_SIGNING.test(contents) || !RELEASE_USES_DEBUG.test(contents)) {
      throw new Error(
        'withAndroidSigning: the app build.gradle signing setup changed shape; update the patterns in plugins/withAndroidSigning.js.',
      );
    }
    contents = contents.replace(DEBUG_SIGNING, `$1${RELEASE_SIGNING}`);
    contents = contents.replace(
      RELEASE_USES_DEBUG,
      `$1(rootProject.file('${PROPS_PATH}').exists() ? signingConfigs.release : signingConfigs.debug)`,
    );
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withAndroidSigning;
