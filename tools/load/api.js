// Load test for staging, never production:
//   k6 run -e API=https://<staging-api>/v1 -e EMAIL=… -e PASSWORD=… tools/load/api.js
// Signs in once per virtual user, then mixes the heaviest calls the apps make. The thresholds are the
// Phase 2 targets; record what staging does in docs/RUNBOOK.md rather than treating them as a gate.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API;
const json = { 'content-type': 'application/json' };

export const options = {
  scenarios: {
    office_hours: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 50 }, { duration: '30s', target: 0 }] },
  },
  thresholds: {
    'http_req_duration{name:pull}': ['p(95)<1500'],
    'http_req_duration{name:push}': ['p(95)<3000'],
    'http_req_duration{name:finalize}': ['p(95)<800'],
    'http_req_duration{name:pdf}': ['p(95)<4000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const res = http.post(`${API}/auth/sign-in`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), { headers: json });
  check(res, { 'signed in': (r) => r.status === 200 });
  const token = res.json('accessToken');
  const companies = http.get(`${API}/companies`, { headers: { authorization: `Bearer ${token}` } }).json('data');
  return { token, companyId: companies[0].id };
}

export default function ({ token, companyId }) {
  const auth = { headers: { ...json, authorization: `Bearer ${token}` } };
  const c = `${API}/companies/${companyId}`;

  // A device catching up: 2,000 changes.
  check(http.get(`${API}/sync/pull?limit=2000`, { ...auth, tags: { name: 'pull' } }), { 'pull 200': (r) => r.status === 200 });

  // An offline device sending 200 queued edits to one draft at once.
  const draft = http.post(`${c}/documents`, JSON.stringify(draftInvoice(c, auth)), { ...auth, tags: { name: 'create' } });
  if (draft.status === 201) {
    const id = draft.json('id');
    const mutations = Array.from({ length: 200 }, (_, i) => ({ id: uuid(), method: 'PATCH', path: `/companies/${companyId}/documents/${id}`, body: { notes: `load ${i}` }, queuedAt: new Date().toISOString() }));
    check(http.post(`${API}/sync/push`, JSON.stringify({ mutations }), { ...auth, tags: { name: 'push' } }), { 'push 200': (r) => r.status === 200 });
    check(http.post(`${c}/documents/${id}/finalize`, '{}', { ...auth, tags: { name: 'finalize' } }), { 'finalize 200': (r) => r.status === 200 });
    check(http.get(`${c}/documents/${id}/pdf`, { ...auth, tags: { name: 'pdf' } }), { 'pdf 200': (r) => r.status === 200 });
  }
  sleep(1);
}

let party;
function draftInvoice(c, auth) {
  party ??= http.get(`${c}/parties?kind=customer&limit=1`, auth).json('data')[0];
  const tax = http.get(`${c}/tax-categories`, auth).json('data')[0];
  return {
    kind: 'invoice',
    partyId: party.id,
    date: new Date().toISOString().slice(0, 10),
    currency: 'INR',
    lines: [{ name: 'Load test item', quantity: 1, unit: 'NOS', unitPrice: { minor: 10000, currency: 'INR' }, taxCategoryId: tax.id }],
  };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
