import { Redirect } from 'expo-router';

/** The assistant is Lixi now; this keeps old links and deep links working. */
export default function Assistant() {
  return <Redirect href="/(app)/lixi" />;
}
