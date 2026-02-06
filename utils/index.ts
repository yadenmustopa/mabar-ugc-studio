
import Swal from 'sweetalert2';

export const showToast = (message: string, icon: 'success' | 'error' | 'warning' | 'info' = 'info') => {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: '#1e293b',
    color: '#f8fafc'
  });
  Toast.fire({ icon, title: message });
};

export const base64ToBlob = (base64: string, contentType: string = 'image/png'): Blob => {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
};

/**
 * Konversi URL Image ke Base64 (tanpa prefix data:image/...)
 */
export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Gagal konversi URL ke Base64:", err);
    throw new Error("Gagal memproses gambar referensi.");
  }
};

export const resizeImageToAspectRatio = async (imageUrl: string, aspectRatio: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Canvas context init failed"));
        const [wRatio, hRatio] = aspectRatio.split(':').map(Number);
        let targetWidth, targetHeight;
        if (img.width / img.height > wRatio / hRatio) {
          targetHeight = img.height;
          targetWidth = img.height * (wRatio / hRatio);
        } else {
          targetWidth = img.width;
          targetHeight = img.width * (hRatio / wRatio);
        }
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const offsetX = (img.width - targetWidth) / 2;
        const offsetY = (img.height - targetHeight) / 2;
        ctx.drawImage(img, offsetX, offsetY, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);
        canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error("Blob null")); }, 'image/png');
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  });
};
