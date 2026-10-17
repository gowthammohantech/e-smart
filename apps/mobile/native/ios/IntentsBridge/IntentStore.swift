import Foundation

/// A customer as mirrored from the JS store by `useIntentEntitySync`.
struct CustomerSnapshot: Codable {
  let id: String
  let name: String
  let code: String
}

/// An active item as mirrored from the JS store by `useIntentEntitySync`.
struct ItemSnapshot: Codable {
  let id: String
  let name: String
  let unit: String
}

/// What an intent asks the JS side to do once the app is in front.
struct PendingAction: Codable {
  let action: String
  let partyId: String
  let itemId: String?
  let quantity: Double
}

/// The one place Swift and JS meet. Intents live in the main app target, so
/// they run in the app's own process and the standard defaults are shared
/// with the bridge module; an App Intents extension would need an App Group.
enum IntentStore {
  static let customersKey = "ebs.intents.customers"
  static let itemsKey = "ebs.intents.items"
  static let pendingKey = "ebs.intents.pending"
  static let pendingNotification = Notification.Name("ebs.intents.pending")

  static var defaults: UserDefaults { .standard }

  static func load<T: Decodable>(_ key: String) -> [T] {
    guard let data = defaults.data(forKey: key) else { return [] }
    return (try? JSONDecoder().decode([T].self, from: data)) ?? []
  }

  static func save(json: String, key: String) {
    defaults.set(Data(json.utf8), forKey: key)
  }
}
