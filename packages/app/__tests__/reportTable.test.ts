import { strFromU8, unzipSync } from 'fflate';
import { exportName, tableHtml, toCsv, xlsxBytes } from '../features/reports/reportTable';

const table = { headers: ['Customer', 'Invoices', 'Amount'], rows: [['Sunrise & Co', 3, 2360.5], ['"Anand", Bengaluru', 1, '1,180']] };

describe('report exports', () => {
  it('builds an xlsx whose numbers stay numbers and text is escaped', () => {
    const files = unzipSync(xlsxBytes('Sales: by customer', table));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Customer</t></is></c>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Sunrise &amp; Co</t></is></c>');
    expect(sheet).toContain('<c r="C2"><v>2360.5</v></c>');
    expect(sheet).toContain('<c r="C3" t="inlineStr"><is><t xml:space="preserve">1,180</t></is></c>');
    // ":" is not allowed in a sheet name.
    expect(strFromU8(files['xl/workbook.xml'])).toContain('<sheet name="Sales  by customer"');
  });

  it('quotes CSV fields that need it', () => {
    expect(toCsv(table).split('\n')).toEqual(['Customer,Invoices,Amount', 'Sunrise & Co,3,2360.5', '"""Anand"", Bengaluru",1,"1,180"']);
  });

  it('prints the table with numbers right-aligned and text escaped', () => {
    const html = tableHtml('Sales <by customer>', 'Vertex · Sep 2026', table);
    expect(html).toContain('<h1>Sales &lt;by customer&gt;</h1>');
    expect(html).toContain('<td class="n">3</td>');
    expect(html).toContain('<td>Sunrise &amp; Co</td>');
  });

  it('names the file after the report and its period', () => {
    expect(exportName('GSTR-1', '2026-09-01', '2026-09-30')).toBe('GSTR-1_2026-09-01_2026-09-30');
    expect(exportName('Sales by customer', '2026-04-01', '2027-03-31')).toBe('Sales_by_customer_2026-04-01_2027-03-31');
  });
});
