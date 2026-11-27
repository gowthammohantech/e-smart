import { useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { ENTITIES, TEMPLATE_VERSION, templateFileName, type Entity, type Group } from '../lib/entities';
import { buildTemplate, readFile } from '../lib/sheets';
import { saveFile } from '../lib/save';
import { sampleSheets, useDemoTools } from '../lib/demo';
import { plansFromSheets } from '../lib/plans';
import type { Business, SheetPlan } from '../types';

const ICON: Record<Entity['id'], IconName> = { contacts: 'users', items: 'box', openings: 'scale', journals: 'journal', sales: 'receipt', purchases: 'cart', payments: 'wallet', expenses: 'tag' };
const GROUPS: { id: Group; help: string }[] = [
  { id: 'Masters', help: 'The people and things everything else refers to. Bring these first.' },
  { id: 'Opening balances', help: 'Where your books stand on the day you start here.' },
  { id: 'Transactions', help: 'What happened before today, to keep your history in one place.' },
];

export function DataScreen({ business, onBack, onUploaded }: { business: Business; onBack: () => void; onUploaded: (plans: SheetPlan[]) => void }) {
  const [wanted, setWanted] = useState<Set<string>>(new Set(['contacts', 'items']));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const demo = useDemoTools();

  const allSelected = wanted.size === ENTITIES.length;

  const toggle = (id: string) =>
    setWanted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const download = async () => {
    setError('');
    setSaved('');
    try {
      const chosen = ENTITIES.filter((e) => wanted.has(e.id));
      const result = await saveFile(templateFileName(), await buildTemplate(chosen.map((e) => e.template), TEMPLATE_VERSION));
      if (result.path) setSaved(result.path);
    } catch (err) {
      setError(`The template could not be saved. ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const take = async (files: FileList | File[]) => {
    setError('');
    setBusy(true);
    try {
      const plans: SheetPlan[] = [];
      for (const file of Array.from(files)) plans.push(...plansFromSheets(file.name, await readFile(file), business.ctx));
      if (!plans.length) throw new Error('We found no data in that file. Check that the first row has column names and the rows below it have your data.');
      onUploaded(plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file couldn’t be read.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="hero" style={{ marginBottom: 0 }}>
        <h1>Bring in your data</h1>
        <p className="lead">
          Importing into <strong>{business.name}</strong>. Pick what you want to bring over and download one template, or choose your own Excel or CSV. If your column names are different, we match them for you and you can fix any we get wrong.
        </p>
      </div>

      <div className="cols wide">
        <section className="card stack">
          <div className="card-head">
            <div>
              <h2>1. Get the template</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>Tick what you want to bring over. You get one Excel file with a sheet for each.</p>
            </div>
            <button className="btn" onClick={() => setWanted(allSelected ? new Set() : new Set(ENTITIES.map((e) => e.id)))}>
              <Icon name="check" size={16} />
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="groups">
            {GROUPS.map((g) => (
              <div key={g.id} className="group">
                <div>
                  <h3>{g.id}</h3>
                  <span className="muted small">{g.help}</span>
                </div>
                <div className="entities">
                  {ENTITIES.filter((e) => e.group === g.id).map((e) => (
                    <label key={e.id} className={`entity ${wanted.has(e.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={wanted.has(e.id)} onChange={() => toggle(e.id)} />
                      <span className="ico">
                        <Icon name={wanted.has(e.id) ? 'check' : ICON[e.id]} size={18} />
                      </span>
                      <span>
                        <strong>{e.title}</strong>
                        <span className="t">{e.blurb}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn primary big" disabled={!wanted.size} onClick={() => void download()}>
              <Icon name="download" size={18} />
              Download template
            </button>
            <span className="muted small">{wanted.size} selected</span>
          </div>
          {saved && (
            <div className="notice good" role="status">
              <Icon name="check" size={18} />
              <span>
                Saved to <strong>{saved}</strong>. Fill it in, then choose it on the right.
              </span>
            </div>
          )}
        </section>

        <section className="card stack" style={{ position: 'sticky', top: 84 }}>
          <div>
            <h2>2. Choose your file</h2>
            <p className="muted small" style={{ margin: '4px 0 0' }}>The template you filled in, or any Excel (.xlsx) or CSV file you already have, from any software.</p>
          </div>
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (e.dataTransfer.files.length) void take(e.dataTransfer.files);
            }}
          >
            {busy ? (
              <span className="row">
                <span className="spinner" /> Reading your file…
              </span>
            ) : (
              <>
                <span className="mark">
                  <Icon name="upload" size={26} />
                </span>
                <strong style={{ fontSize: 16 }}>Drop your file here</strong>
                <span className="muted small">.xlsx or .csv, one or more files</span>
                <button className="btn primary" onClick={() => input.current?.click()}>
                  Browse for a file
                </button>
              </>
            )}
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,.txt"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void take(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {error && (
            <div className="notice bad" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}
          <div className="notice info">
            <Icon name="info" size={18} />
            <span>One file can hold several sheets, such as Contacts, Items and Sales Invoices. We read them in the right order.</span>
          </div>
          {demo.on && (
            <div className="demo">
              <div className="row spread">
                <strong>Demo tools</strong>
                <button className="btn link small" onClick={() => demo.set(false)}>
                  Turn off
                </button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Made-up records for every kind of data, so you can skip the Excel step. Each load is a fresh set tagged “Demo”. Nothing is saved until you confirm on the review screen.
              </p>
              <div className="row">
                <button className="btn" onClick={() => onUploaded(plansFromSheets('Sample data', sampleSheets(business.ctx), business.ctx, true))}>
                  Load sample data
                </button>
                <button className="btn" onClick={() => onUploaded(plansFromSheets('Sample data with mistakes', sampleSheets(business.ctx, { mistakes: true }), business.ctx, true))}>
                  Load sample with mistakes
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div>
        <button className="btn link" onClick={onBack}>
          <Icon name="back" size={16} /> Change business
        </button>
      </div>
    </div>
  );
}
