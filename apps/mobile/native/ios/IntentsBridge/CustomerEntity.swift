import AppIntents

struct CustomerEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Customer"
  static let defaultQuery = CustomerQuery()

  let id: String
  let name: String
  let code: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(code)")
  }

  init(_ snapshot: CustomerSnapshot) {
    id = snapshot.id
    name = snapshot.name
    code = snapshot.code
  }
}

struct CustomerQuery: EntityStringQuery {
  private func all() -> [CustomerEntity] {
    let snapshots: [CustomerSnapshot] = IntentStore.load(IntentStore.customersKey)
    return snapshots.map(CustomerEntity.init)
  }

  func entities(for identifiers: [String]) async throws -> [CustomerEntity] {
    all().filter { identifiers.contains($0.id) }
  }

  func entities(matching string: String) async throws -> [CustomerEntity] {
    all().filter {
      $0.name.localizedCaseInsensitiveContains(string) || $0.code.localizedCaseInsensitiveContains(string)
    }
  }

  func suggestedEntities() async throws -> [CustomerEntity] {
    all()
  }
}
