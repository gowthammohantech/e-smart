import { useState } from 'react';
import { BUSINESS_TYPES } from '@esmart/core/data/masters';
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { isValidGstin, normalizeGstin, stateCodeOfGstin } from '@esmart/core/domain/gstin';
import { api, errorMessage } from '../lib/api';

const TYPE_LABEL: Record<string, string> = {
  retail: 'Retail shop',
  wholesale: 'Wholesale / trading',
  services: 'Services',
  freelancer: 'Freelancer / professional',
  distributor: 'Distributor',
  manufacturer: 'Manufacturer',
  restaurant: 'Restaurant / café',
  other: 'Other',
};

/** The few things a business needs to start; the rest is set up inside Elixir Books Smart. India only for now. */
export function BusinessForm({ onCreated }: { onCreated: (businessId: string) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('retail');
  const [gstin, setGstin] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per form, so pressing Create twice returns the same business.
  const [key] = useState(() => crypto.randomUUID());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const tax = gstin.trim() ? normalizeGstin(gstin) : undefined;
    if (tax && !isValidGstin(tax)) return setError('That GSTIN isn’t valid. It has 15 characters, like 27AABCV1234F1ZO. Leave it blank if you are not registered.');
    const code = stateCode || (tax ? stateCodeOfGstin(tax) : undefined);
    const state = INDIAN_STATES.find((s) => s.code === code);
    if (!state) return setError('Choose the state your business is in.');
    setBusy(true);
    try {
      const { data } = await api().POST('/companies', {
        headers: { 'Idempotency-Key': key },
        body: {
          name: name.trim(),
          businessType: type,
          country: 'IN',
          baseCurrency: 'INR',
          address: { line1: line1.trim(), city: city.trim(), state: state.name, stateCode: state.code, postalCode: pin.trim(), country: 'IN' },
          fiscalYearStartMonth: 4,
          taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: !!tax, ...(tax && { identifier: tax }), placeOfSupplyStateCode: state.code },
          seedDefaults: true,
        } as never,
      });
      const id = (data as { id?: string } | undefined)?.id;
      if (!id) throw new Error('The business was not created.');
      onCreated(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form wide" onSubmit={submit}>
      <label className="field full">
        Business name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="field">
        Type of business
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        GSTIN <span className="opt">(optional)</span>
        <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} />
      </label>
      <label className="field full">
        Address
        <input type="text" value={line1} onChange={(e) => setLine1(e.target.value)} required />
      </label>
      <label className="field">
        City
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} required />
      </label>
      <label className="field">
        State
        <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} required={!gstin}>
          <option value="">{gstin ? 'From the GSTIN' : 'Choose…'}</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        PIN code
        <input type="text" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={6} minLength={6} required />
      </label>
      {error && <div className="notice bad full" role="alert">{error}</div>}
      <div className="full row">
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? 'Creating…' : 'Create business'}
        </button>
      </div>
    </form>
  );
}
