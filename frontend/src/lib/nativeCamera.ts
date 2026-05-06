import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';

export const isNative = Capacitor.isNativePlatform();

export async function pickImageNative(source: 'camera' | 'photos'): Promise<File | null> {
  try {
    const photo = await CapacitorCamera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });

    if (!photo.dataUrl) return null;

    const res = await fetch(photo.dataUrl);
    const blob = await res.blob();
    const ext = photo.format === 'png' ? 'png' : 'jpg';
    return new File([blob], `scorecard.${ext}`, {
      type: blob.type || (photo.format === 'png' ? 'image/png' : 'image/jpeg'),
    });
  } catch {
    // User cancelled or permission denied — not an error
    return null;
  }
}
