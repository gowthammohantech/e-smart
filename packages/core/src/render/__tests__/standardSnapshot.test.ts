/**
 * The standard page, byte for byte, across the shapes a document takes. Taken before the
 * renderer was split into layouts, so the split (and every later layout) cannot move a
 * business that never chose one.
 */
import { buildDocumentHtml } from '../documentHtml';
import { CASES } from './fixtures/documents';

describe('the standard page is unchanged', () => {
  it.each(CASES)('%s', (_name, input) => {
    expect(buildDocumentHtml(input)).toMatchSnapshot();
  });
});
