import { Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';

/**
 * Read the text in a photo on the device with Google ML Kit (no upload).
 * Returns null where the native module is not present: web, Expo Go, or a
 * build made before the module was added. The caller tells the person so.
 */
export async function recognizeText(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const result = await TextRecognition.recognize(uri);
    return result.text;
  } catch {
    return null;
  }
}
