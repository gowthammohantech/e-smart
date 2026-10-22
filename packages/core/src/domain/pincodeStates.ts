/**
 * Which state a PIN code belongs to, from its first digits. India Post
 * numbers PINs by postal circle: the first two digits name a region, and a
 * region is one state, or a few where circles cross state lines (the Union
 * Territories next to their parent state, Uttarakhand inside the Uttar Pradesh
 * circle…); Goa, inside the Maharashtra circle, is told apart by three digits
 * (403). Those border cases list every
 * state a PIN with that prefix can be in, so a correct address is never
 * refused; only a PIN that clearly belongs elsewhere is.
 *
 * It says nothing about the city: that needs the full PIN directory.
 * Army Post Office PINs (90–99) belong to no state and are not checked.
 */

/** GST state codes (see stateCodes.ts). */
const KA = '29', TN = '33', PY = '34', KL = '32', LD = '31', TS = '36', AP = '37', MH = '27', GA = '30', GJ = '24', DD = '26';
const MP = '23', CG = '22', RJ = '08', UP = '09', UK = '05', DL = '07', HR = '06', PB = '03', CH = '04', HP = '02';
const JK = '01', LA = '38', WB = '19', SK = '11', AN = '35', OD = '21', AS = '18', BR = '10', JH = '20';
const NE = ['12', '13', '14', '15', '16', '17']; // Arunachal, Nagaland, Manipur, Mizoram, Tripura, Meghalaya

/** By the first two digits of the PIN. */
const BY_PREFIX: Record<string, string[]> = {
  '11': [DL],
  '12': [HR], '13': [HR],
  '14': [PB], '15': [PB], '16': [PB, CH],
  '17': [HP],
  '18': [JK], '19': [JK, LA],
  '20': [UP], '21': [UP], '22': [UP], '23': [UP], '24': [UP, UK], '25': [UP], '26': [UP, UK], '27': [UP], '28': [UP],
  '30': [RJ], '31': [RJ], '32': [RJ], '33': [RJ], '34': [RJ],
  '36': [GJ], '37': [GJ], '38': [GJ], '39': [GJ, DD],
  '40': [MH], '41': [MH], '42': [MH], '43': [MH], '44': [MH],
  '45': [MP], '46': [MP], '47': [MP], '48': [MP], '49': [CG],
  '50': [TS],
  '51': [AP], '52': [AP], '53': [AP, PY],
  '56': [KA], '57': [KA], '58': [KA], '59': [KA],
  '60': [TN, PY], '61': [TN], '62': [TN], '63': [TN], '64': [TN],
  '67': [KL, PY], '68': [KL, LD], '69': [KL],
  '70': [WB], '71': [WB], '72': [WB], '73': [WB, SK], '74': [WB, AN],
  '75': [OD], '76': [OD], '77': [OD],
  '78': [AS],
  '79': [...NE, AS],
  '80': [BR, JH], '81': [BR, JH], '82': [BR, JH], '83': [BR, JH], '84': [BR, JH], '85': [BR, JH],
};

/** Where three digits are already enough to be exact. */
const BY_THREE: Record<string, string[]> = {
  '403': [GA],
};

/** The states a PIN can be in, or null when its prefix isn't one we can place (so it isn't checked). */
export function statesForPincode(pin: string): string[] | null {
  const v = pin.trim();
  if (!/^[1-9][0-9]{5}$/.test(v)) return null;
  return BY_THREE[v.slice(0, 3)] ?? BY_PREFIX[v.slice(0, 2)] ?? null;
}

/** True only when the PIN is known to belong to other states than `stateCode`. */
export function pincodeContradictsState(pin: string, stateCode: string | undefined): boolean {
  if (!stateCode) return false;
  const states = statesForPincode(pin);
  return !!states && !states.includes(stateCode);
}
