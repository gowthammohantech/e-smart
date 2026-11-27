import { useState } from 'react';
import { api, errorMessage, tokenStore } from './lib/api';
import { loadBusiness } from './lib/business';
import { useTheme } from './lib/theme';
import { Icon } from './components/Icon';
import type { Account, Business, PlanResult, SheetPlan, Step } from './types';
import { SourceScreen } from './screens/SourceScreen';
import { AccountScreen } from './screens/AccountScreen';
import { CompanyScreen } from './screens/CompanyScreen';
import { DataScreen } from './screens/DataScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { DoneScreen } from './screens/DoneScreen';

const STEPS: { id: Step; label: string }[] = [
  { id: 'source', label: 'Where from' },
  { id: 'account', label: 'Your account' },
  { id: 'company', label: 'Business' },
  { id: 'data', label: 'Your data' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

export function App() {
  const { theme, toggle } = useTheme();
  const [step, setStep] = useState<Step>('source');
  const [account, setAccount] = useState<Account | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [results, setResults] = useState<PlanResult[]>([]);
  const [, bump] = useState(0);

  const at = STEPS.findIndex((s) => s.id === step);

  const signOut = async () => {
    try {
      await api().POST('/auth/sign-out');
    } catch (err) {
      console.warn('sign-out', errorMessage(err));
    }
    tokenStore.set(null);
    setAccount(null);
    setBusiness(null);
    setPlans([]);
    setResults([]);
    setStep('account');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">EB</span>
          <div>
            Elixir Books Smart
            <small>Migrator</small>
          </div>
        </div>
        <div className="actions">
          {account && (
            <>
              <span className="chip" title={business ? `${account.name || account.email} · ${business.name}` : account.email}>
                <Icon name="user" size={16} />
                <span>
                  {account.name || account.email}
                  {business ? ` · ${business.name}` : ''}
                </span>
              </span>
              <button className="iconbtn" onClick={signOut} aria-label="Sign out" title="Sign out">
                <Icon name="logout" size={18} />
              </button>
            </>
          )}
          <button className="iconbtn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
        </div>
      </header>

      <main className="stage">
        <nav className="progress" aria-label="Progress">
          {STEPS.map((s, i) => (
            <span key={s.id} style={{ display: 'contents' }}>
              {i > 0 && <span className={`pline ${i <= at ? 'done' : ''}`} />}
              <span className={`pstep ${i === at ? 'on' : ''} ${i < at ? 'done' : ''}`} aria-current={i === at ? 'step' : undefined}>
                <b>{i < at ? <Icon name="check" size={14} /> : i + 1}</b>
                <span>{s.label}</span>
              </span>
            </span>
          ))}
        </nav>

        {step === 'source' && (
          <SourceScreen
            onPick={() => setStep('account')}
            onServerChange={() => {
              setAccount(null);
              setBusiness(null);
              bump((n) => n + 1);
            }}
          />
        )}
        {step === 'account' && (
          <AccountScreen
            onBack={() => setStep('source')}
            onSignedIn={(a, businessId) => {
              setAccount(a);
              setBusiness(null);
              // A business just created here is already the one to use; anyone else picks theirs.
              if (!businessId) return setStep('company');
              loadBusiness(businessId)
                .then((b) => {
                  setBusiness(b);
                  setStep('data');
                })
                .catch(() => setStep('company'));
            }}
          />
        )}
        {step === 'company' && (
          <CompanyScreen
            preselect={business?.id}
            onBack={() => setStep('account')}
            onPicked={(b) => {
              setBusiness(b);
              setStep('data');
            }}
          />
        )}
        {step === 'data' && business && (
          <DataScreen
            business={business}
            onBack={() => setStep('company')}
            onUploaded={(p) => {
              setPlans(p);
              setStep('review');
            }}
          />
        )}
        {step === 'review' && business && (
          <ReviewScreen
            business={business}
            plans={plans}
            setPlans={setPlans}
            onBack={() => setStep('data')}
            onDone={(r) => {
              setResults(r);
              setStep('done');
            }}
          />
        )}
        {step === 'done' && business && (
          <DoneScreen
            business={business}
            results={results}
            onAnother={() => {
              setPlans([]);
              setResults([]);
              setStep('data');
            }}
          />
        )}
      </main>
    </div>
  );
}
