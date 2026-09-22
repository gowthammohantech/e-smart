import AppIntents

struct ElixirShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: CreateInvoiceIntent(),
      phrases: [
        "Create an invoice in \(.applicationName)",
        "New \(.applicationName) invoice",
        "Create an invoice for \(\.$customer) in \(.applicationName)",
        "Bill \(\.$customer) in \(.applicationName)",
      ]
    )
  }
}
