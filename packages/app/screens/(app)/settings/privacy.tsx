import { Redirect } from 'expo-router';

/** Merged into Your profile; kept so old links and bookmarks still land there. */
export default function Moved() {
  return <Redirect href="/(app)/settings/profile" />;
}
