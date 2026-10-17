import AppIntents

struct ItemEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Item"
  static let defaultQuery = ItemQuery()

  let id: String
  let name: String
  let unit: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(unit)")
  }

  init(_ snapshot: ItemSnapshot) {
    id = snapshot.id
    name = snapshot.name
    unit = snapshot.unit
  }
}

struct ItemQuery: EntityStringQuery {
  private func all() -> [ItemEntity] {
    let snapshots: [ItemSnapshot] = IntentStore.load(IntentStore.itemsKey)
    return snapshots.map(ItemEntity.init)
  }

  func entities(for identifiers: [String]) async throws -> [ItemEntity] {
    all().filter { identifiers.contains($0.id) }
  }

  func entities(matching string: String) async throws -> [ItemEntity] {
    all().filter { $0.name.localizedCaseInsensitiveContains(string) }
  }

  func suggestedEntities() async throws -> [ItemEntity] {
    all()
  }
}
