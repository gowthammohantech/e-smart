// Eager barrel. React Native bundles every import anyway, so lazy namespace
// loading would buy only async complexity and a Suspense boundary this app
// does not have.
import auth from './auth.json';
import common from './common.json';
import compliance from './compliance.json';
import contacts from './contacts.json';
import domain from './domain.json';
import errors from './errors.json';
import inventory from './inventory.json';
import lixi from './lixi.json';
import nav from './nav.json';
import onboarding from './onboarding.json';
import plan from './plan.json';
import purchases from './purchases.json';
import reports from './reports.json';
import sales from './sales.json';
import settings from './settings.json';

export default {
  auth,
  common,
  compliance,
  contacts,
  domain,
  errors,
  inventory,
  lixi,
  nav,
  onboarding,
  plan,
  purchases,
  reports,
  sales,
  settings,
};
