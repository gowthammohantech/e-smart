/**
 * A CSV chosen in the browser, read as text; null if the person backs out.
 * Web only: phones paste the CSV instead, until a file picker ships with a store build.
 */
export function pickCsvOnWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      void file.text().then(resolve);
    };
    input.click();
  });
}
