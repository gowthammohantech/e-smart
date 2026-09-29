const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopts the UIScene lifecycle, which iOS 27 requires at launch. The window
 * and React Native start move to `native/ios/App/SceneDelegate.swift`; this
 * plugin declares the scene in Info.plist and takes the window setup out of
 * the generated AppDelegate so it isn't created twice.
 */
const WINDOW_SETUP =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

  return withAppDelegate(config, (cfg) => {
    const { contents } = cfg.modResults;
    if (WINDOW_SETUP.test(contents)) {
      cfg.modResults.contents = contents.replace(
        WINDOW_SETUP,
        '\n    // The window and React Native start in SceneDelegate (plugins/withSceneLifecycle.js).\n',
      );
    } else if (!contents.includes('SceneDelegate')) {
      throw new Error(
        'withSceneLifecycle: the AppDelegate window setup changed shape; update the pattern in plugins/withSceneLifecycle.js.',
      );
    }
    return cfg;
  });
}

module.exports = withSceneLifecycle;
