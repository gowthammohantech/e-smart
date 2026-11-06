const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * expo-camera ships prebuilt with play-services-code-scanner, whose
 * delegate activity is locked to portrait. Android 16 ignores that lock on
 * large screens and Play Console flags it, so override it in our manifest.
 */
const SCANNER_ACTIVITY = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

function withUnlockedScannerOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.activity = (app.activity ?? []).filter((a) => a.$['android:name'] !== SCANNER_ACTIVITY);
    app.activity.push({
      $: {
        'android:name': SCANNER_ACTIVITY,
        'android:screenOrientation': 'unspecified',
        'tools:replace': 'android:screenOrientation',
      },
    });
    return cfg;
  });
}

module.exports = withUnlockedScannerOrientation;
