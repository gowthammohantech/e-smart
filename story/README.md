# Elixir Books Smart — specification set

This folder holds the written specification for **Elixir Books Smart**, a
mobile-first billing, GST-compliance and books product for Indian small and
medium businesses. The app in this repository is the working prototype of what
these documents describe; where a rule appears in both, the code in
`src/domain` is the reference implementation and the document explains why.

## The documents

| File | What it answers | Primary reader |
|---|---|---|
| [01-brd.md](01-brd.md) | Why this product exists, who pays for it, what success looks like | Founders, sales, finance |
| [02-prd.md](02-prd.md) | What the product does, for whom, in what order, at what quality | Product, engineering leads, QA |
| [03-frd.md](03-frd.md) | Exactly how every rule behaves — arithmetic, states, compliance, data | Engineers, QA, auditors |
| [04-modules-and-features.md](04-modules-and-features.md) | Module-by-module feature detail, routes, entities, gating | Engineering, QA, support |
| [05-design-system.md](05-design-system.md) | Tokens, primitives, composites, charts, accessibility, voice | Design, front-end |
| [06-ux-and-flows.md](06-ux-and-flows.md) | Navigation, every screen, every end-to-end flow, every edge state | Design, engineering, QA |

## Reading order

Read the BRD once, for context. Read the PRD before planning a release. Read
the FRD before writing or reviewing any code that touches money, tax, stock or
the GST portals — it is the only place the exact ordering of operations is
written down. The modules document is the working index; the design system and
UX documents are the day-to-day references for anyone building a screen.

## How these map to the code

| Document section | Code |
|---|---|
| FRD §6 Currency | `src/domain/fx.ts` |
| FRD §9 Document lifecycle | `src/domain/documentStates.ts` |
| FRD §10 Calculation | `src/domain/lineCalc.ts` |
| FRD §12 Payments | `src/domain/receivables.ts`, `src/domain/paymentAccounts.ts` |
| FRD §13 Inventory | `src/domain/stockLedger.ts` |
| FRD §15 Tax | `src/domain/taxEngine.ts` |
| FRD §16 Compliance | `src/domain/eInvoice.ts`, `src/domain/ewayBill.ts`, `src/domain/irpAdapter.ts`, `src/domain/gstin.ts` |
| FRD §17 Numbering | `src/domain/numbering.ts` |
| FRD §18 Receivables | `src/domain/receivables.ts` |
| PRD packaging | `src/domain/plan.ts` |
| Design system | `src/theme/tokens.ts`, `src/theme/chartColors.ts`, `src/components/**` |
| Backend contract | `docs/api/openapi.yaml`, `docs/database/schema.sql` |

## Status

The documents describe the **complete product**. The prototype implements the
whole client and every calculation rule; it does not implement a server, real
portal connectivity, real OCR, or a real assistant model. Each document marks
those boundaries where they matter. `docs/api/` already defines the backend
that removes them.
