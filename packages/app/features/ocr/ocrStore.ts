import { create } from 'zustand';
import type { OcrResult } from '@esmart/core/domain/parseReceipt';

export type { OcrField, OcrResult } from '@esmart/core/domain/parseReceipt';

type OcrState = {
  result: OcrResult | null;
  setResult: (r: OcrResult | null) => void;
  updateField: (key: string, value: string) => void;
};

export const useOcrStore = create<OcrState>((set, get) => ({
  result: null,
  setResult: (result) => set({ result }),
  updateField: (key, value) => {
    const r = get().result;
    if (!r) return;
    set({
      result: {
        ...r,
        // Editing a field means the user has confirmed it.
        fields: r.fields.map((f) => (f.key === key ? { ...f, value, confidence: 1 } : f)),
      },
    });
  },
}));
