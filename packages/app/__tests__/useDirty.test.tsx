import React from 'react';
import { act, create } from 'react-test-renderer';
import { canonicalJson, useDirty } from '../components/useDirty';

/** Renders a form with two fields and a record key; returns the latest "changed" answer and the setters. */
function setup() {
  const out: { dirty: boolean; setName: (v: string) => void; setKey: (k: string | null) => void; setPhone: (v: string | undefined) => void } = {
    dirty: false,
    setName: () => undefined,
    setKey: () => undefined,
    setPhone: () => undefined,
  };
  function Form() {
    const [name, setName] = React.useState('Asha');
    const [phone, setPhone] = React.useState<string | undefined>(undefined);
    const [key, setKey] = React.useState<string | null>('a');
    out.dirty = useDirty([name, phone], key);
    out.setName = setName;
    out.setKey = setKey;
    out.setPhone = setPhone;
    return null;
  }
  act(() => {
    create(<Form />);
  });
  return out;
}

describe('useDirty', () => {
  it('is clean as the form opens, dirty on a change, clean again when it is put back', () => {
    const f = setup();
    expect(f.dirty).toBe(false);
    act(() => f.setName('Bala'));
    expect(f.dirty).toBe(true);
    act(() => f.setName('Asha'));
    expect(f.dirty).toBe(false);
  });

  it('treats a cleared optional field the same as one never set', () => {
    const f = setup();
    act(() => f.setPhone('123'));
    expect(f.dirty).toBe(true);
    act(() => f.setPhone(undefined));
    expect(f.dirty).toBe(false);
  });

  it('starts counting again from a new record, with the fields as they are then', () => {
    const f = setup();
    act(() => {
      f.setName('Bala');
      f.setKey('b');
    });
    expect(f.dirty).toBe(false);
    act(() => f.setName('Chitra'));
    expect(f.dirty).toBe(true);
  });
});

describe('canonicalJson', () => {
  it('ignores key order and empty fields', () => {
    expect(canonicalJson({ b: 1, a: { y: '', x: 2 }, c: undefined })).toBe(canonicalJson({ a: { x: 2 }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});
