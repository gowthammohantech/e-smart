import React from 'react';
import { Pressable, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { DataTable, type Column } from '../DataTable';

type Row = { id: string; name: string; amount: number };

const rows: Row[] = [
  { id: 'a', name: 'Banana', amount: 30 },
  { id: 'b', name: 'Apple', amount: 10 },
  { id: 'c', name: 'Cherry', amount: 20 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  { key: 'amount', header: 'Amount', render: (r) => String(r.amount) },
];

// Unmounted after each test, so an icon font that loads late doesn't render into a torn-down environment.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});

function render(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <ThemeProvider mode="light" script="latin">
        <DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} scroll={false} {...props} />
      </ThemeProvider>,
    );
  });
  mounted.push(root);
  return root;
}

// Composite elements only, so a role passed down to a host view is counted once.
const byRole = (root: ReactTestRenderer, role: string) =>
  root.root.findAll((n) => typeof n.type !== 'string' && n.props.role === role && (n.type === View || n.type === Pressable));

describe('DataTable semantics', () => {
  it('exposes table, row, column header and cell roles', () => {
    const root = render();
    expect(byRole(root, 'table')).toHaveLength(1);
    expect(byRole(root, 'columnheader')).toHaveLength(2);
    // One header row plus one per data row.
    expect(byRole(root, 'row')).toHaveLength(1 + rows.length);
    expect(byRole(root, 'cell')).toHaveLength(columns.length * rows.length);
    // The header row is no longer announced as a heading.
    expect(root.root.findAll((n) => n.props.accessibilityRole === 'header')).toHaveLength(0);
  });

  it('reports aria-sort only on sortable columns and follows the sort', () => {
    const root = render();
    const [name, amount] = byRole(root, 'columnheader');
    expect(name.props['aria-sort']).toBe('none');
    expect(amount.props['aria-sort']).toBeUndefined();

    const sortButton = name.findByProps({ accessibilityRole: 'button' });
    expect(sortButton.props.accessibilityLabel).toBe('Sort by Name');
    act(() => sortButton.props.onPress());
    expect(byRole(root, 'columnheader')[0].props['aria-sort']).toBe('ascending');
    expect(byRole(root, 'columnheader')[0].findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel).toBe(
      'Name, sorted ascending',
    );
  });

  it('keeps clickable rows as rows with their label', () => {
    const root = render({ onRowPress: () => {}, rowLabel: (r) => `Open ${r.name}` });
    const clickable = root.root.findAll(
      (n) => typeof n.type !== 'string' && n.props.role === 'row' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel,
    );
    expect(clickable).toHaveLength(rows.length);
    expect(clickable[0].props.accessibilityLabel).toBe('Open Banana');
  });

  it('translates the pager', () => {
    const root = render({ pageSize: 2 });
    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('1–2 of 3');
    expect(text).toContain('Page 1 of 2');
    expect(root.root.findAllByProps({ accessibilityLabel: 'Next page' }).length).toBeGreaterThan(0);
  });
});
