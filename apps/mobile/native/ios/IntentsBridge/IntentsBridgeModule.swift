internal import ExpoModulesCore
import AppIntents

/// Inline Expo module (see `experiments.inlineModules` in app.json) that lets
/// JS mirror customers and items for Siri, and pick up actions intents leave.
class IntentsBridgeModule: Module {
  private var observer: NSObjectProtocol?

  func definition() -> ModuleDefinition {
    Name("IntentsBridge")

    Events("onPendingAction")

    Function("syncEntities") { (customersJson: String, itemsJson: String) in
      IntentStore.save(json: customersJson, key: IntentStore.customersKey)
      IntentStore.save(json: itemsJson, key: IntentStore.itemsKey)
      // Phrases that name a customer only match what was last registered.
      ElixirShortcuts.updateAppShortcutParameters()
    }

    Function("consumePendingAction") { () -> String? in
      guard let data = IntentStore.defaults.data(forKey: IntentStore.pendingKey) else { return nil }
      IntentStore.defaults.removeObject(forKey: IntentStore.pendingKey)
      return String(data: data, encoding: .utf8)
    }

    OnStartObserving { [weak self] in
      self?.observer = NotificationCenter.default.addObserver(
        forName: IntentStore.pendingNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onPendingAction", [:])
      }
    }

    OnStopObserving { [weak self] in
      if let observer = self?.observer {
        NotificationCenter.default.removeObserver(observer)
        self?.observer = nil
      }
    }
  }
}
