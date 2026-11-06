import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Icon } from '@esmart/ui/components/Icon';
import { Menu, MenuItem, useMenuAnchor } from '@esmart/ui/components/Menu';
import { WEB_INPUT_RESET } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import type { DocumentLine, TaxCategory } from '@esmart/core/types';
import { calculateLine } from '@esmart/core/domain/lineCalc';
import type { TaxContext } from '@esmart/core/domain/taxEngine';
import { formatMoney, formatPercent, sanitizeAmountInput } from '@esmart/core/lib/format';
import { fromMajor, subtract, toMajor } from '@esmart/core/lib/money';
import { unitDecimals, unitShortName } from '@esmart/core/data/masters';

type Col = 'name' | 'qty' | 'rate' | 'discount';

// Sized to fit the editor's main column (about 730px) with the item name taking the rest.
const W = { no: 32, qty: 104, rate: 108, discount: 104, tax: 88, amount: 116, actions: 40 };
const ITEM_MIN = 120;
const MIN_WIDTH = W.no + ITEM_MIN + W.qty + W.rate + W.discount + W.tax + W.amount + W.actions;

/**
 * A desktop document's lines as an editable grid: name, quantity, rate and
 * discount type straight into the row; tax picks from a list; the ⋯ menu
 * opens the full line sheet (description, HSN, unit, inclusive tax) or
 * removes the line. Tab walks a row; Enter goes down a column, and from the
 * last line asks for a new one. Values are committed when a cell is left.
 */
export function LineGrid({
  lines,
  currency,
  taxContext,
  taxCategories,
  onUpdate,
  onRemove,
  onEdit,
  onAddRequest,
  maxQuantity,
}: {
  lines: DocumentLine[];
  currency: string;
  taxContext: TaxContext;
  taxCategories: TaxCategory[];
  onUpdate: (id: string, patch: Partial<DocumentLine>) => void;
  onRemove: (id: string) => void;
  /** Opens the full editor for a line. */
  onEdit: (line: DocumentLine) => void;
  /** Enter on the last line: add another (the item picker). */
  onAddRequest: () => void;
  /** A return can't take back more than its source line carried. */
  maxQuantity?: (line: DocumentLine) => number | undefined;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common']);
  const [taxFor, setTaxFor] = useState<DocumentLine | null>(null);
  // The grid's own width: inside the sideways scroller the rows would otherwise take their
  // natural width, and a long item name would push the totals and ⋯ out of view.
  const [boxWidth, setBoxWidth] = useState(0);
  // Cells are found by id: the grid is the desktop (web) editor's, and ids keep
  // the moves out of render, where refs may not be read.
  const gridId = useId().replace(/:/g, '');
  const cellId = (row: number, col: Col) => `${gridId}-${row}-${col}`;
  const focusCell = (row: number, col: Col) => (globalThis.document?.getElementById(cellId(row, col)) as HTMLElement | null)?.focus();
  const onEnter = (row: number, col: Col) => {
    if (row < lines.length - 1) focusCell(row + 1, col);
    else onAddRequest();
  };

  const headerCell = (label: string, width?: number, align: 'left' | 'right' = 'left') => (
    <View role="columnheader" style={[width ? { width } : { flex: 1, minWidth: ITEM_MIN }, { paddingHorizontal: 8, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      <Text variant="caption" tone="muted" weight="600" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  return (
    <View
      style={{ backgroundColor: t.c.paper, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.c.line, overflow: 'hidden' }}
      onLayout={(e) => setBoxWidth(Math.round(e.nativeEvent.layout.width))}
    >
    {/* A narrow window scrolls the grid sideways rather than clipping its totals. */}
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, minWidth: MIN_WIDTH }} showsHorizontalScrollIndicator>
    <View role="table" style={{ flexGrow: 1, width: boxWidth ? Math.max(MIN_WIDTH, boxWidth - 2) : undefined }}>
      <View role="row" style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36, backgroundColor: t.c.card2, borderBottomWidth: 1, borderBottomColor: t.c.line }}>
        {headerCell(tr('sales:grid.lineNo'), W.no)}
        {headerCell(tr('sales:line.itemOrService'))}
        {headerCell(tr('sales:line.quantity'), W.qty, 'right')}
        {headerCell(tr('sales:line.rate'), W.rate, 'right')}
        {headerCell(tr('sales:line.discount'), W.discount, 'right')}
        {headerCell(tr('sales:line.tax'), W.tax)}
        {headerCell(tr('sales:line.lineTotal'), W.amount, 'right')}
        <View role="columnheader" aria-label={tr('common:table.actions')} style={{ width: W.actions }} />
      </View>

      {lines.map((line, row) => {
        const calc = calculateLine(line, currency, taxContext);
        const lineTotal = subtract(calc.gross, calc.discount);
        const max = maxQuantity?.(line);
        const n = row + 1;
        const label = (column: string) => tr('sales:grid.cellLabel', { column, n });
        return (
          <View
            key={line.id}
            role="row"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 44,
              borderBottomWidth: row < lines.length - 1 ? 1 : 0,
              borderBottomColor: t.c.line,
            }}
          >
            <View role="cell" style={{ width: W.no, paddingHorizontal: 8 }}>
              <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {n}
              </Text>
            </View>
            <View role="cell" style={{ flex: 1, minWidth: ITEM_MIN, paddingHorizontal: 4 }}>
              <GridInput
                id={cellId(row, 'name')}
                value={line.name}
                label={label(tr('sales:line.itemOrService'))}
                invalid={!line.name.trim()}
                onCommit={(v) => v.trim() && v.trim() !== line.name && onUpdate(line.id, { name: v.trim() })}
                onEnter={() => onEnter(row, 'name')}
                placeholder={tr('sales:editor.untitledLine')}
              />
              {line.hsnCode ? (
                <Text variant="micro" tone="muted" style={{ paddingHorizontal: 6 }} numberOfLines={1}>
                  {`HSN ${line.hsnCode}`}
                </Text>
              ) : null}
            </View>
            <View role="cell" style={{ width: W.qty, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <View style={{ flex: 1 }}>
              <GridInput
                id={cellId(row, 'qty')}
                value={String(line.quantity)}
                label={label(tr('sales:line.quantity'))}
                numeric
                sanitize={(v) => decimalInput(v, unitDecimals(line.unit))}
                invalid={line.quantity <= 0}
                onCommit={(v) => {
                  const q = Number(v);
                  if (!Number.isFinite(q) || q <= 0) return;
                  const next = max !== undefined ? Math.min(q, max) : q;
                  if (next !== line.quantity) onUpdate(line.id, { quantity: next });
                }}
                onEnter={() => onEnter(row, 'qty')}
              />
              </View>
              {/* The unit rides along with the quantity it counts, rather than taking a column. */}
              <Text variant="micro" tone="muted" numberOfLines={1} style={{ maxWidth: 34 }}>
                {unitShortName(line.unit)}
              </Text>
            </View>
            <View role="cell" style={{ width: W.rate, paddingHorizontal: 4 }}>
              <GridInput
                id={cellId(row, 'rate')}
                value={line.unitPrice.minor ? String(toMajor(line.unitPrice)) : ''}
                label={label(tr('sales:line.rate'))}
                numeric
                sanitize={(v) => sanitizeAmountInput(v, currency)}
                invalid={line.unitPrice.minor <= 0}
                placeholder="0"
                onCommit={(v) => {
                  const price = fromMajor(v || '0', currency);
                  if (price.minor !== line.unitPrice.minor) onUpdate(line.id, { unitPrice: price });
                }}
                onEnter={() => onEnter(row, 'rate')}
              />
            </View>
            <View role="cell" style={{ width: W.discount, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <View style={{ flex: 1 }}>
                <GridInput
                  id={cellId(row, 'discount')}
                  value={line.discountValue ? String(line.discountValue) : ''}
                  label={label(tr('sales:line.discount'))}
                  numeric
                  sanitize={(v) => decimalInput(v, 2)}
                  placeholder="0"
                  invalid={line.unitPrice.minor > 0 && calc.taxable.minor <= 0}
                  onCommit={(v) => {
                    const d = Number(v) || 0;
                    if (d !== line.discountValue) onUpdate(line.id, { discountValue: d });
                  }}
                  onEnter={() => onEnter(row, 'discount')}
                />
              </View>
              <Pressable
                onPress={() => onUpdate(line.id, { discountMode: line.discountMode === 'percent' ? 'amount' : 'percent' })}
                accessibilityRole="button"
                accessibilityLabel={tr('sales:grid.discountMode', { mode: line.discountMode === 'percent' ? '%' : currency, n })}
                style={(state) => [
                  {
                    minWidth: 30,
                    height: 28,
                    paddingHorizontal: 4,
                    borderRadius: t.radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: (state as WebPressState).hovered ? t.c.card2 : 'transparent',
                  },
                  focusRing(t, (state as WebPressState).focused),
                ]}
              >
                <Text variant="caption" tone="muted" weight="600">
                  {line.discountMode === 'percent' ? '%' : currency}
                </Text>
              </Pressable>
            </View>
            <View role="cell" style={{ width: W.tax, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setTaxFor(line)}
                disabled={!!line.gst?.reimbursement}
                accessibilityRole="button"
                accessibilityLabel={`${label(tr('sales:line.tax'))}: ${formatPercent(line.taxRate)}`}
                style={(state) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                    height: 32,
                    paddingHorizontal: 6,
                    borderRadius: t.radius.sm,
                    borderWidth: 1,
                    borderColor: (state as WebPressState).hovered ? t.c.inputBorder : 'transparent',
                  },
                  focusRing(t, (state as WebPressState).focused),
                ]}
              >
                <Text variant="small" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatPercent(line.taxRate)}
                </Text>
                {line.taxInclusive ? (
                  <Text variant="micro" tone="primary" weight="600">
                    {tr('sales:editor.inclusive')}
                  </Text>
                ) : null}
                <Icon name="chevron-down" size={12} color={t.c.muted} />
              </Pressable>
            </View>
            <View role="cell" style={{ width: W.amount, paddingHorizontal: 8, alignItems: 'flex-end' }}>
              <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                {formatMoney(lineTotal)}
              </Text>
            </View>
            <View role="cell" style={{ width: W.actions, alignItems: 'center' }}>
              <LineMenu
                label={tr('sales:grid.lineActions', { n })}
                onEdit={() => onEdit(line)}
                onRemove={() => onRemove(line.id)}
              />
            </View>
          </View>
        );
      })}

    </View>
    </ScrollView>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.card2 }}>
        <Text variant="micro" tone="muted">
          {tr('sales:grid.enterHint')}
        </Text>
      </View>

      <SelectSheet
        visible={!!taxFor}
        onClose={() => setTaxFor(null)}
        title={tr('sales:line.tax')}
        options={taxCategories.map((c) => ({ value: c.id, label: c.name, trailing: formatPercent(c.rate) }))}
        value={taxFor?.taxCategoryId ?? ''}
        onSelect={(id) => {
          const cat = taxCategories.find((c) => c.id === id);
          if (taxFor && cat) onUpdate(taxFor.id, { taxCategoryId: cat.id, taxRate: cat.rate });
          setTaxFor(null);
        }}
      />
    </View>
  );
}

/** Digits and one decimal point, with at most `decimals` places (none for a whole-number unit). */
function decimalInput(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (!decimals || !rest.length) return decimals ? cleaned.replace(/\.(?=.*\.)/g, '') : whole;
  return `${whole}.${rest.join('').slice(0, decimals)}`;
}

/**
 * One editable cell. It keeps its own text while focused and hands the value
 * over when left (or on Enter), so a half-typed number never reaches the totals.
 */
function GridInput({
  value,
  label,
  onCommit,
  onEnter,
  numeric,
  sanitize,
  invalid,
  placeholder,
  id,
}: {
  value: string;
  label: string;
  onCommit: (text: string) => void;
  onEnter: () => void;
  numeric?: boolean;
  /** Cleans what's typed: digits, one point and so many decimals, say. */
  sanitize?: (text: string) => string;
  invalid?: boolean;
  placeholder?: string;
  id: string;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <TextInput
      id={id}
      value={shown}
      onChangeText={(v) => setDraft(sanitize ? sanitize(v) : v)}
      onFocus={() => setDraft(value)}
      onBlur={commit}
      onSubmitEditing={() => {
        commit();
        onEnter();
      }}
      blurOnSubmit={false}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      accessibilityLabel={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      placeholderTextColor={t.c.muted}
      selectTextOnFocus
      style={{
        height: 32,
        paddingHorizontal: 6,
        borderRadius: t.radius.sm,
        borderWidth: 1,
        borderColor: invalid ? t.c.bad : draft !== null ? t.c.primary : 'transparent',
        backgroundColor: draft !== null ? t.c.paper : 'transparent',
        color: t.c.text,
        fontSize: t.fontSize.small,
        textAlign: numeric ? 'right' : 'left',
        fontVariant: numeric ? ['tabular-nums'] : undefined,
        ...WEB_INPUT_RESET,
      }}
    />
  );
}

/** A line's ⋯ button: the full editor, or remove. */
function LineMenu({ label, onEdit, onRemove }: { label: string; onEdit: () => void; onRemove: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const { setAnchor, rect, open, close, visible } = useMenuAnchor();
  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-haspopup="menu"
        aria-expanded={visible}
        style={(state) => [
          {
            width: 30,
            height: 30,
            borderRadius: t.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: (state as WebPressState).hovered || visible ? t.c.card2 : 'transparent',
          },
          focusRing(t, (state as WebPressState).focused),
        ]}
      >
        <Icon name="dots-horizontal" size={18} color={t.c.muted} />
      </Pressable>
      <Menu anchor={rect} onClose={close} align="right" width={200}>
        <MenuItem
          icon="pencil-outline"
          label={tr('sales:grid.moreDetails')}
          onPress={() => {
            close();
            onEdit();
          }}
        />
        <MenuItem
          icon="trash-can-outline"
          label={tr('sales:line.remove')}
          destructive
          onPress={() => {
            close();
            onRemove();
          }}
        />
      </Menu>
    </>
  );
}
