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

const text = (root: ReactTestRenderer) => JSON.stringify(root.toJSON());
const checkboxes = (root: ReactTestRenderer) =>
  root.root.findAll((n) => typeof n.type !== 'string' && n.props.role === 'checkbox' && typeof n.props.onPress === 'function');

describe('DataTable states', () => {
  it('shows skeleton rows, hidden from screen readers, while loading with no rows', () => {
    const root = render({ rows: [], loading: true, pageSize: 4 });
    const rowsShown = byRole(root, 'row').filter((r) => r.props['aria-hidden']);
    expect(rowsShown).toHaveLength(4);
    expect(byRole(root, 'table')[0].props['aria-busy']).toBe(true);
  });

  it('shows the error with Retry in place of rows', () => {
    const onRetry = jest.fn();
    const root = render({ rows: [], error: 'This list couldn’t load.', onRetry });
    expect(text(root)).toContain('This list couldn’t load.');
    const retry = root.root.findAllByProps({ accessibilityLabel: 'Retry' })[0];
    act(() => retry.props.onPress());
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('DataTable selection', () => {
  it('ticks rows and the page checkbox goes mixed, then all', () => {
    let keys: string[] = [];
    const onSelectionChange = jest.fn((k: string[]) => (keys = k));
    const root = render({ selectable: true, selectedKeys: [], onSelectionChange, rowLabel: (r) => r.name });
    const [all, banana] = checkboxes(root);
    expect(all.props['aria-label']).toBe('Select all on this page');
    expect(banana.props['aria-label']).toBe('Select Banana');
    act(() => banana.props.onPress());
    expect(keys).toEqual(['a']);
    act(() => all.props.onPress());
    expect(keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('shows the bulk bar with the count and the caller’s actions', () => {
    const root = render({
      selectable: true,
      selectedKeys: ['a', 'c'],
      onSelectionChange: () => {},
      bulkActions: (k) => <View testID={`bulk-${k.length}`} />,
    });
    expect(text(root)).toContain('2 selected');
    expect(root.root.findAllByProps({ testID: 'bulk-2' }).length).toBeGreaterThan(0);
    expect(checkboxes(root)[0].props['aria-checked']).toBe('mixed');
  });
});

describe('DataTable row actions', () => {
  it('gives each row a ⋯ button named for the row, and none to a row without actions', () => {
    const root = render({
      rowLabel: (r) => r.name,
      rowActions: (r) => (r.id === 'b' ? [] : [{ key: 'open', label: 'Open', onPress: () => {} }]),
    });
    expect(root.root.findAllByProps({ accessibilityLabel: 'Actions for Banana' }).length).toBeGreaterThan(0);
    expect(root.root.findAllByProps({ accessibilityLabel: 'Actions for Apple' })).toHaveLength(0);
  });
});

describe('DataTable paging', () => {
  const many: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}`, amount: i }));

  it('offers rows per page and changes the page size', () => {
    const root = render({ rows: many, pageSizeOptions: [5, 10] });
    expect(text(root)).toContain('1–5 of 12');
    const picker = root.root.findAllByProps({ accessibilityLabel: 'Rows per page: 5' })[0];
    expect(picker).toBeTruthy();
  });

  it('asks a server list for more when the page runs past the rows loaded', () => {
    const onLoadMore = jest.fn();
    const root = render({ rows: many.slice(0, 5), pageSize: 5, totalCount: 12, hasMore: true, onLoadMore });
    expect(text(root)).toContain('1–5 of 12');
    act(() => root.root.findAllByProps({ accessibilityLabel: 'Next page' })[0].props.onPress());
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('stays on its page when a fetched page is appended', () => {
    const view = (r: Row[]) => (
      <ThemeProvider mode="light" script="latin">
        <DataTable<Row> columns={columns} rows={r} rowKey={(x) => x.id} scroll={false} pageSize={5} totalCount={12} hasMore onLoadMore={() => {}} />
      </ThemeProvider>
    );
    let root!: ReactTestRenderer;
    act(() => {
      root = create(view(many.slice(0, 10)));
    });
    mounted.push(root);
    act(() => root.root.findAllByProps({ accessibilityLabel: 'Next page' })[0].props.onPress());
    expect(text(root)).toContain('6–10 of 12');
    act(() => root.update(view(many)));
    expect(text(root)).toContain('6–10 of 12');
  });
});

describe('DataTable fitting', () => {
  it('drops secondary columns, first declared first, when the table is too narrow', () => {
    const wide: Column<Row>[] = [
      { key: 'name', header: 'Name', width: 300, render: (r) => r.name },
      { key: 'first', header: 'First extra', width: 200, secondary: true, render: () => '' },
      { key: 'second', header: 'Second extra', width: 200, secondary: true, render: () => '' },
      { key: 'amount', header: 'Amount', width: 150, render: (r) => String(r.amount) },
    ];
    const root = render({ columns: wide });
    expect(byRole(root, 'columnheader')).toHaveLength(4);
    const box = root.root.find((n) => typeof n.props.onLayout === 'function' && n.type === View);
    // 300 + 200 + 150 + 8 fits in 700; the first extra goes, the second stays.
    act(() => box.props.onLayout({ nativeEvent: { layout: { width: 700, height: 400, x: 0, y: 0 } } }));
    const headers = byRole(root, 'columnheader').map((h) => h.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children).join(' '));
    expect(headers).toHaveLength(3);
    expect(headers.some((h) => h.includes('First extra'))).toBe(false);
    expect(headers.some((h) => h.includes('Second extra'))).toBe(true);
  });
});
