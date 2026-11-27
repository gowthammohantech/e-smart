/**
 * Where a person's data can come from. Only the sources we actually offer are listed: a spreadsheet
 * from anywhere, and Elixir Books (coming soon). A new platform is a new entry here plus an adapter
 * that produces the same records the spreadsheet path does.
 */
export type Source = {
  id: string;
  name: string;
  blurb: string;
  icon: 'sheet' | 'books';
  status: 'available' | 'soon';
};

export const SOURCES: Source[] = [
  { id: 'excel', name: 'Excel or CSV file', blurb: 'Coming from any software, or just have a spreadsheet? Use our template, or bring your own file. We match the columns for you.', icon: 'sheet', status: 'available' },
  { id: 'elixir-books', name: 'Elixir Books', blurb: 'Move everything across from your existing Elixir Books account.', icon: 'books', status: 'soon' },
];
