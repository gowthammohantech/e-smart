import { create } from 'zustand';

export type OcrField = {
  key: string;
  label: string;
  value: string;
  /** 0–1. Anything below 0.75 is surfaced for the user to check. */
  confidence: number;
};

export type OcrResult = {
  imageUri?: string;
  kind: 'expense' | 'purchaseBill';
  fields: OcrField[];
  lines: { name: string; quantity: number; unitPrice: number; confidence: number }[];
};

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

/**
 * Stand-in for the OCR service. A real build posts the image to the extraction
 * pipeline; here we produce a plausible result with mixed confidence so the
 * review step has something meaningful to show.
 */
export function mockExtract(imageUri: string | undefined, kind: 'expense' | 'purchaseBill'): OcrResult {
  const today = new Date().toISOString().slice(0, 10);
  if (kind === 'expense') {
    return {
      imageUri,
      kind,
      fields: [
        { key: 'vendor', label: 'Vendor', value: 'Urban Logistics', confidence: 0.94 },
        { key: 'date', label: 'Date', value: today, confidence: 0.97 },
        { key: 'amount', label: 'Total amount', value: '4720.00', confidence: 0.91 },
        { key: 'tax', label: 'Tax amount', value: '720.00', confidence: 0.68 },
        { key: 'reference', label: 'Bill number', value: 'UL/2026/4471', confidence: 0.72 },
        { key: 'category', label: 'Suggested category', value: 'Transport & freight', confidence: 0.83 },
      ],
      lines: [],
    };
  }
  return {
    imageUri,
    kind,
    fields: [
      { key: 'vendor', label: 'Supplier', value: 'Precision Components', confidence: 0.96 },
      { key: 'gstin', label: 'Supplier GSTIN', value: '24AABCP1234F1ZQ', confidence: 0.88 },
      { key: 'date', label: 'Invoice date', value: today, confidence: 0.95 },
      { key: 'reference', label: 'Invoice number', value: 'PC-2026-1183', confidence: 0.79 },
      { key: 'amount', label: 'Invoice total', value: '86260.00', confidence: 0.93 },
      { key: 'tax', label: 'GST', value: '13160.00', confidence: 0.71 },
    ],
    lines: [
      { name: 'Steel Ball Bearing 6203', quantity: 240, unitPrice: 118, confidence: 0.9 },
      { name: 'Hex Bolt M10x50 (100 pk)', quantity: 60, unitPrice: 420, confidence: 0.74 },
      { name: 'Washer M10 (500 pk)', quantity: 80, unitPrice: 175, confidence: 0.62 },
    ],
  };
}
