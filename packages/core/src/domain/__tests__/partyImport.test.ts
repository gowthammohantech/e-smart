import { guessColumns, kindOf, parseCsv, partiesFromCsv, stateCodeOf } from '../partyImport';

describe('contacts from a CSV', () => {
  it('reads quoted fields, doubled quotes, line breaks inside quotes, CRLF, a BOM and blank lines', () => {
    const csv = '﻿Name,Address\r\n"Sri ""Murugan"" Traders","12, Anna Salai\nChennai"\r\n\r\nKumar Stores,Madurai\n';
    expect(parseCsv(csv)).toEqual([
      ['Name', 'Address'],
      ['Sri "Murugan" Traders', '12, Anna Salai\nChennai'],
      ['Kumar Stores', 'Madurai'],
    ]);
  });

  it('finds columns by the names Excel, Tally and other apps give them', () => {
    expect(guessColumns(['Party Name', 'GSTIN/UIN', 'Mobile No.', 'PIN Code', 'Opening Balance', 'Dr/Cr', 'Credit Days', 'Whatever'])).toEqual({
      name: 0,
      taxId: 1,
      phone: 2,
      postalCode: 3,
      openingBalance: 4,
      openingSide: 5,
      paymentTermsDays: 6,
    });
  });

  it('reads the type and the state the way people write them', () => {
    expect(kindOf('Sundry Debtors')).toBe('customer');
    expect(kindOf('Vendor')).toBe('supplier');
    expect(kindOf('Both')).toBe('both');
    expect(kindOf('Landlord')).toBeUndefined();
    expect(stateCodeOf('Tamil Nadu')).toBe('33');
    expect(stateCodeOf('tamilnadu')).toBe('33');
    expect(stateCodeOf('KA')).toBe('29');
    expect(stateCodeOf('7')).toBe('07');
    expect(stateCodeOf('Ontario')).toBeUndefined();
  });

  it('makes a party of each good row and says what is wrong with the rest', () => {
    const rows = parseCsv(
      [
        'Name,GSTIN,State,Opening Balance,Dr/Cr,Credit Days,Type,Email',
        'Murugan Traders,33AAACM1234A1ZF,,"1,25,000.50",,30,,',
        'Bad GST,33AAACM1234A1Z9,,,,,,',
        ',,,,,,,',
        'Kumar Stores,,Karnataka,(5000),,15 days,Vendor,kumar@example',
        'Ravi Agencies,,TN,2000,Cr,,both,ravi@example.com',
      ].join('\n'),
    );
    const out = partiesFromCsv(rows, guessColumns(rows[0]), { kind: 'customer', currency: 'INR' });
    expect(out).toHaveLength(4);

    const [murugan, bad, kumar, ravi] = out;
    expect(murugan.problems).toEqual([]);
    expect(murugan.line).toBe(2);
    expect(murugan.party).toMatchObject({
      kind: 'customer',
      taxId: '33AAACM1234A1ZF',
      pan: 'AAACM1234A',
      billingAddress: { state: 'Tamil Nadu', stateCode: '33', country: 'IN' },
      openingBalance: { minor: 12_500_050, currency: 'INR' },
      paymentTermsDays: 30,
    });
    expect(murugan.party!.openingBalanceSide).toBeUndefined();

    expect(bad.party).toBeUndefined();
    expect(bad.problems[0]).toMatch(/GSTIN/);

    // A bracketed amount is negative: the other side from a supplier's usual credit.
    expect(kumar.problems).toEqual(['Email kumar@example is not valid']);
    expect(kumar.party).toBeUndefined();

    expect(ravi.party).toMatchObject({ kind: 'both', openingBalanceSide: 'cr', openingBalance: { minor: 200_000 }, billingAddress: { stateCode: '33' } });
  });

  it('turns a negative opening balance into the other side', () => {
    const rows = parseCsv('Name,Opening Balance,Type\nKumar Stores,(5000),Vendor');
    const [kumar] = partiesFromCsv(rows, guessColumns(rows[0]), { kind: 'customer', currency: 'INR' });
    expect(kumar.party).toMatchObject({ kind: 'supplier', openingBalance: { minor: 500_000 }, openingBalanceSide: 'dr' });
  });

  it('refuses a state that does not match the GSTIN', () => {
    const rows = parseCsv('Name,GSTIN,State\nMurugan Traders,33AAACM1234A1ZF,Kerala');
    const [row] = partiesFromCsv(rows, guessColumns(rows[0]), { kind: 'customer', currency: 'INR' });
    expect(row.problems).toEqual(["State Kerala does not match the GSTIN's state"]);
  });
});

describe('custom fields from a CSV', () => {
  it('fills a contact field from the column named after it', () => {
    const rows = parseCsv('Name,Drug Licence,Zone\nMurugan Traders,TN/MDU/20B/1,\nKumar Stores,,North');
    const out = partiesFromCsv(rows, guessColumns(rows[0]), { kind: 'customer', currency: 'INR' }, [
      { id: 'cf_dl', label: 'Drug licence' },
      { id: 'cf_zone', label: 'zone' },
    ]);
    expect(out[0].party!.customFields).toEqual({ cf_dl: 'TN/MDU/20B/1' });
    expect(out[1].party!.customFields).toEqual({ cf_zone: 'North' });
  });
});
