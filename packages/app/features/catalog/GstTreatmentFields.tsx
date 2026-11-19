import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { GstFlags, ItcEligibility, ItemType, SupplyType, TaxCategory } from '@esmart/core/types';

const SUPPLY_TYPES: SupplyType[] = ['taxable', 'nil', 'exempt', 'nonGst'];
const ITC: ItcEligibility[] = ['eligible', 'blocked', 'ineligible'];

/** Only what differs from a plain taxable, creditable supply is kept. */
function tidy(flags: GstFlags): GstFlags | undefined {
  const out: GstFlags = {
    ...(flags.supplyType && flags.supplyType !== 'taxable' && { supplyType: flags.supplyType }),
    ...(flags.reimbursement && { reimbursement: true }),
    ...(flags.capitalGoods && { capitalGoods: true }),
    ...(flags.followsHighestRate && { followsHighestRate: true }),
    ...(flags.itcEligibility && flags.itcEligibility !== 'eligible' && { itcEligibility: flags.itcEligibility }),
    ...(flags.reverseCharge && { reverseCharge: true }),
    ...(flags.cessRate && flags.cessRate > 0 && { cessRate: flags.cessRate }),
  };
  return Object.keys(out).length ? out : undefined;
}

/**
 * How GST treats an item: nil-rated, exempt or non-GST supplies, pure-agent reimbursements,
 * capital goods, credit that can't be claimed, reverse charge and cess. Defaults suit almost
 * everything, so these sit together below the tax rate.
 */
export function GstTreatmentFields({
  value,
  onChange,
  type,
  taxCategory,
}: {
  value: GstFlags | undefined;
  onChange: (v: GstFlags | undefined) => void;
  type: ItemType;
  /** The item's tax rate: above 0% it is a taxable supply; at 0% it is nil-rated, exempt or non-GST. */
  taxCategory?: Pick<TaxCategory, 'rate' | 'name'>;
}) {
  const { t: tr } = useTranslation(['inventory']);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [itcOpen, setItcOpen] = useState(false);
  const [cess, setCess] = useState(value?.cessRate ? String(value.cessRate) : '');
  const flags = value ?? {};
  const set = (p: Partial<GstFlags>) => onChange(tidy({ ...flags, ...p }));
  const supplyType = flags.supplyType ?? 'taxable';
  const taxable = supplyType === 'taxable' && !flags.reimbursement;
  // The types the rate allows: a rate above 0% is taxable only, and 0% is anything but taxable.
  const zeroRate = !!taxCategory && taxCategory.rate <= 0;
  const types = !taxCategory ? SUPPLY_TYPES : zeroRate ? SUPPLY_TYPES.filter((s) => s !== 'taxable') : (['taxable'] as SupplyType[]);
  // A rate changed to one its type doesn't fit moves the type with it: to taxable above 0%, and at 0%
  // to what the rate's own name says (an "Exempt" or "Non-GST" rate), else nil-rated.
  useEffect(() => {
    if (!taxCategory) return;
    if (!zeroRate && supplyType !== 'taxable') set({ supplyType: 'taxable' });
    else if (zeroRate && supplyType === 'taxable') set({ supplyType: /non[\s-]?gst/i.test(taxCategory.name) ? 'nonGst' : /exempt/i.test(taxCategory.name) ? 'exempt' : 'nil' });
    // Only when the rate or the type changes; `set` is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxCategory?.rate, taxCategory?.name, supplyType]);

  return (
    <>
      <PickerField
        label={tr('inventory:gst.supplyType')}
        value={tr(`inventory:gst.supply.${supplyType}`)}
        onPress={() => setSupplyOpen(true)}
        icon="scale-balance"
        hint={tr(`inventory:gst.supplyHint.${supplyType}`)}
        disabled={!!flags.reimbursement}
      />
      <SwitchField
        label={tr('inventory:gst.reimbursement')}
        description={tr('inventory:gst.reimbursementHint')}
        value={!!flags.reimbursement}
        onValueChange={(reimbursement) => set({ reimbursement })}
      />
      {type === 'service' ? (
        <SwitchField
          label={tr('inventory:gst.followsHighestRate')}
          description={tr('inventory:gst.followsHighestRateHint')}
          value={!!flags.followsHighestRate}
          onValueChange={(followsHighestRate) => set({ followsHighestRate })}
        />
      ) : null}
      {taxable ? (
        <>
          <SwitchField label={tr('inventory:gst.reverseCharge')} description={tr('inventory:gst.reverseChargeHint')} value={!!flags.reverseCharge} onValueChange={(reverseCharge) => set({ reverseCharge })} />
          <TextField
            label={tr('inventory:gst.cessRate')}
            value={cess}
            onChangeText={(v) => {
              const clean = v.replace(/[^0-9.]/g, '');
              setCess(clean);
              set({ cessRate: Number(clean) || undefined });
            }}
            placeholder="0"
            keyboardType="decimal-pad"
            icon="percent-outline"
            hint={tr('inventory:gst.cessHint')}
          />
          {type === 'goods' ? (
            <SwitchField label={tr('inventory:gst.capitalGoods')} description={tr('inventory:gst.capitalGoodsHint')} value={!!flags.capitalGoods} onValueChange={(capitalGoods) => set({ capitalGoods })} />
          ) : null}
          <PickerField
            label={tr('inventory:gst.itc')}
            value={tr(`inventory:gst.itcOption.${flags.itcEligibility ?? 'eligible'}`)}
            onPress={() => setItcOpen(true)}
            icon="cash-refund"
            hint={tr('inventory:gst.itcHint')}
          />
        </>
      ) : null}

      <SelectSheet
        visible={supplyOpen}
        onClose={() => setSupplyOpen(false)}
        title={tr('inventory:gst.supplyType')}
        options={types.map((s) => ({ value: s, label: tr(`inventory:gst.supply.${s}`), description: tr(`inventory:gst.supplyHint.${s}`) }))}
        value={supplyType}
        onSelect={(s) => set({ supplyType: s as SupplyType })}
        searchable={false}
      />
      <SelectSheet
        visible={itcOpen}
        onClose={() => setItcOpen(false)}
        title={tr('inventory:gst.itc')}
        options={ITC.map((s) => ({ value: s, label: tr(`inventory:gst.itcOption.${s}`), description: tr(`inventory:gst.itcOptionHint.${s}`) }))}
        value={flags.itcEligibility ?? 'eligible'}
        onSelect={(s) => set({ itcEligibility: s as ItcEligibility })}
        searchable={false}
      />
    </>
  );
}

/**
 * The part of a line's GST treatment a purchase decides for itself: reverse charge, capital goods and
 * whether the credit can be claimed. Picked from the item when the line is added; changed here per bill.
 */
export function PurchaseLineGstFields({ value, onChange, type }: { value: GstFlags | undefined; onChange: (v: GstFlags | undefined) => void; type: ItemType }) {
  const { t: tr } = useTranslation(['inventory']);
  const [itcOpen, setItcOpen] = useState(false);
  const flags = value ?? {};
  const set = (p: Partial<GstFlags>) => onChange(tidy({ ...flags, ...p }));
  if (flags.reimbursement || (flags.supplyType && flags.supplyType !== 'taxable')) return null;
  return (
    <>
      <SwitchField label={tr('inventory:gst.reverseCharge')} description={tr('inventory:gst.reverseChargeHint')} value={!!flags.reverseCharge} onValueChange={(reverseCharge) => set({ reverseCharge })} />
      {type === 'goods' ? (
        <SwitchField label={tr('inventory:gst.capitalGoods')} description={tr('inventory:gst.capitalGoodsHint')} value={!!flags.capitalGoods} onValueChange={(capitalGoods) => set({ capitalGoods })} />
      ) : null}
      <PickerField
        label={tr('inventory:gst.itc')}
        value={tr(`inventory:gst.itcOption.${flags.itcEligibility ?? 'eligible'}`)}
        onPress={() => setItcOpen(true)}
        icon="cash-refund"
        hint={tr('inventory:gst.itcHint')}
      />
      <SelectSheet
        visible={itcOpen}
        onClose={() => setItcOpen(false)}
        title={tr('inventory:gst.itc')}
        options={ITC.map((s) => ({ value: s, label: tr(`inventory:gst.itcOption.${s}`), description: tr(`inventory:gst.itcOptionHint.${s}`) }))}
        value={flags.itcEligibility ?? 'eligible'}
        onSelect={(s) => set({ itcEligibility: s as ItcEligibility })}
        searchable={false}
      />
    </>
  );
}
