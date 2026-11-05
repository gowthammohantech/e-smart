import { cleanAmount, matchColumns, parseCsv, squashHeader } from '../csv';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, line breaks in a field, CRLF and a BOM', () => {
    const text = '﻿Name,Notes\r\n"Vertex, Traders","Said ""hello""\nthen left"\r\nPlain,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Notes'],
      ['Vertex, Traders', 'Said "hello"\nthen left'],
      ['Plain', ''],
    ]);
  });
});

describe('matchColumns', () => {
  const aliases = { name: ['name', 'itemname'], sku: ['sku', 'itemcode'], price: ['rate', 'saleprice'] };

  it('finds fields by header however it is written, first match wins', () => {
    expect(squashHeader('Item Name / Code')).toBe('itemnamecode');
    expect(matchColumns(['Item Name', 'Item-Code', 'Sale Price', 'Rate', 'Colour'], aliases)).toEqual({ name: 0, sku: 1, price: 2 });
  });
});

describe('cleanAmount', () => {
  it('takes rupee signs, Indian grouping and bracketed negatives', () => {
    expect(cleanAmount('₹ 1,20,000.50')).toBe('120000.50');
    expect(cleanAmount('(2,500)')).toBe('-2500');
    expect(cleanAmount('  ')).toBeUndefined();
    expect(cleanAmount('twelve')).toBeNull();
    expect(cleanAmount('1.234')).toBeNull();
  });
});
