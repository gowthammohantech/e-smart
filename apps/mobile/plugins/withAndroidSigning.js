const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs release builds with the Play upload key. The keystore and its
 * passwords live in `credentials/` (gitignored) as `elixir-upload.keystore`
 * and `android-signing.properties`. Without them a release APK for testing is
 * signed with the debug key, as the template ships, but the store bundle
 * (`bundleRelease`) refuses to build: Play rejects a debug-signed upload, and
 * one that slipped through would lock the listing to the wrong key.
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

const STORE_GUARD = `
// From plugins/withAndroidSigning.js: never a debug-signed store bundle.
gradle.taskGraph.whenReady { graph ->
    if (graph.hasTask(':app:bundleRelease') && !rootProject.file('${PROPS_PATH}').exists()) {
        throw new GradleException("bundleRelease needs the upload key: put elixir-upload.keystore and android-signing.properties in apps/mobile/credentials.")
    }
}
`;

const DEBUG_SIGNING = /(signingConfigs \{\n\s*debug \{[\s\S]*?\n\s{8}\})/;
const RELEASE_USES_DEBUG =
  /(release \{\n(?:\s*\/\/.*\n)*\s*signingConfig )signingConfigs\.debug/;

/** The app build.gradle with release signing wired in; unchanged when it already is. */
function signReleases(contents) {
  if (contents.includes(PROPS_PATH)) return contents;
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
  return contents + STORE_GUARD;
}

function withAndroidSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = signReleases(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withAndroidSigning;
module.exports.signReleases = signReleases;
