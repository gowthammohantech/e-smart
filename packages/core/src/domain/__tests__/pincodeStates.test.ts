import { pincodeContradictsState, statesForPincode } from '../pincodeStates';

// Well-known PINs, with the GST code of the state they are in.
const KNOWN: [string, string, string][] = [
  ['400001', '27', 'Mumbai'], ['411001', '27', 'Pune'], ['440001', '27', 'Nagpur'],
  ['110001', '07', 'Delhi'], ['560001', '29', 'Bengaluru'], ['600001', '33', 'Chennai'],
  ['641001', '33', 'Coimbatore'], ['700001', '19', 'Kolkata'], ['500001', '36', 'Hyderabad'],
  ['380001', '24', 'Ahmedabad'], ['395001', '24', 'Surat'], ['302001', '08', 'Jaipur'],
  ['342001', '08', 'Jodhpur'], ['226001', '09', 'Lucknow'], ['201301', '09', 'Noida'],
  ['282001', '09', 'Agra'], ['221001', '09', 'Varanasi'], ['800001', '10', 'Patna'],
  ['834001', '20', 'Ranchi'], ['462001', '23', 'Bhopal'], ['492001', '22', 'Raipur'],
  ['160017', '04', 'Chandigarh'], ['143001', '03', 'Amritsar'], ['122001', '06', 'Gurugram'],
  ['121001', '06', 'Faridabad'], ['171001', '02', 'Shimla'], ['190001', '01', 'Srinagar'],
  ['194101', '38', 'Leh'], ['248001', '05', 'Dehradun'], ['249401', '05', 'Haridwar'],
  ['263001', '05', 'Nainital'], ['781001', '18', 'Guwahati'], ['795001', '14', 'Imphal'],
  ['793001', '17', 'Shillong'], ['799001', '16', 'Agartala'], ['737101', '11', 'Gangtok'],
  ['744101', '35', 'Port Blair'], ['403001', '30', 'Panaji'], ['396210', '26', 'Daman'],
  ['396230', '26', 'Silvassa'], ['682001', '32', 'Kochi'], ['695001', '32', 'Thiruvananthapuram'],
  ['682555', '31', 'Kavaratti'], ['605001', '34', 'Puducherry'], ['533464', '34', 'Yanam'],
  ['673310', '34', 'Mahe'], ['751001', '21', 'Bhubaneswar'], ['520001', '37', 'Vijayawada'],
  ['530001', '37', 'Visakhapatnam'],
];

describe('statesForPincode', () => {
  it.each(KNOWN)('%s (%s) is accepted for %s', (pin, state) => {
    expect(statesForPincode(pin)).toContain(state);
    expect(pincodeContradictsState(pin, state)).toBe(false);
  });

  it('refuses a PIN that clearly belongs to another state', () => {
    expect(pincodeContradictsState('560001', '24')).toBe(true); // Bengaluru PIN, Gujarat
    expect(pincodeContradictsState('400001', '29')).toBe(true); // Mumbai PIN, Karnataka
    expect(pincodeContradictsState('110001', '27')).toBe(true); // Delhi PIN, Maharashtra
    expect(pincodeContradictsState('600001', '32')).toBe(true); // Chennai PIN, Kerala
    expect(pincodeContradictsState('500001', '37')).toBe(true); // Hyderabad PIN, Andhra Pradesh
    expect(pincodeContradictsState('400001', '30')).toBe(true); // Goa PINs start 403
  });

  it('does not judge what it cannot place', () => {
    expect(statesForPincode('900001')).toBeNull(); // Army Post Office
    expect(statesForPincode('012345')).toBeNull(); // not a PIN
    expect(statesForPincode('4000')).toBeNull();
    expect(pincodeContradictsState('560001', undefined)).toBe(false); // no state chosen yet
    expect(pincodeContradictsState('900001', '27')).toBe(false);
  });
});
