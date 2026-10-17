import * as ImagePicker from 'expo-image-picker';

/** The server takes PNG and JPEG up to this size. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export type LogoPick = { uri: string } | { error: 'badType' | 'tooLarge' } | null;

/**
 * Opens the photo library for a logo. Returns null when the person backs out,
 * and an error name when the image can't be used, so the screen can say why
 * now rather than after an upload fails.
 *
 * No built-in crop step: asking for one makes iOS fall back to its slow
 * gallery screen and Android open a second screen after the pick.
 */
export async function pickLogo(): Promise<LogoPick> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.mimeType && !/^image\/(png|jpe?g)$/i.test(asset.mimeType)) return { error: 'badType' };
  if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) return { error: 'tooLarge' };
  return { uri: asset.uri };
}
