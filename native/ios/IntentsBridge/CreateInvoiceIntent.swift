import AppIntents

/// Starts a new invoice in the app. Creation itself stays in JS
/// (`createDocument`), so this only hands over what the person chose and
/// brings the app forward on the New Invoice screen.
struct CreateInvoiceIntent: AppIntent {
  static let title: LocalizedStringResource = "Create Invoice"
  static let description = IntentDescription("Start a new invoice for a customer in Elixir Books.")
  static let openAppWhenRun = true

  @Parameter(title: "Customer", requestValueDialog: "Which customer is this invoice for?")
  var customer: CustomerEntity

  @Parameter(title: "Item")
  var item: ItemEntity?

  @Parameter(title: "Quantity", default: 1)
  var quantity: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Invoice \(\.$customer)") {
      \.$item
      \.$quantity
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let pending = PendingAction(
      action: "createInvoice",
      partyId: customer.id,
      itemId: item?.id,
      quantity: max(quantity, 0.001)
    )
    // Store first, then notify: a cold start reads the store once JS is up,
    // a warm start hears the notification straight away.
    IntentStore.defaults.set(try JSONEncoder().encode(pending), forKey: IntentStore.pendingKey)
    NotificationCenter.default.post(name: IntentStore.pendingNotification, object: nil)
    return .result()
  }
}
