export async function captureLastFrameFromVideoBlob(
    videoBlob: Blob,
    onProgress?: (percent: number) => void,
    offset: number = 0.2 // Mulai mundur 0.2 detik dari durasi
): Promise<string> {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(videoBlob);

        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";

        const cleanup = () => {
            video.onerror = null;
            video.onseeked = null;
            video.onloadedmetadata = null;
            URL.revokeObjectURL(url);
            video.remove();
        };

        video.onloadedmetadata = () => {
            onProgress?.(40);
            // Langsung lompat ke titik target
            const targetTime = Math.max(0, video.duration - offset);
            video.currentTime = targetTime;
        };

        video.onseeked = () => {
            onProgress?.(90);
            if (video.readyState >= 2) {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext("2d");
                    if (ctx && video.videoWidth > 0) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const base64 = canvas.toDataURL("image/jpeg", 0.8);
                        cleanup();
                        resolve(base64);
                    } else {
                        throw new Error("Invalid Frame");
                    }
                } catch (e) {
                    retry();
                }
            } else {
                retry();
            }
        };

        const retry = () => {
            cleanup();
            if (offset > 2.0) { // Batas maksimal mundur 2 detik
                reject(new Error("Video rusak atau tidak bisa didekode."));
                return;
            }
            console.warn(`Retry dengan offset lebih besar: ${offset + 0.3}s`);
            // Rekursif dengan membuat elemen video baru (fresh start)
            captureLastFrameFromVideoBlob(videoBlob, onProgress, offset + 0.3)
                .then(resolve)
                .catch(reject);
        };

        video.onerror = () => {
            console.error("Decode Error detected, restarting video element...");
            retry();
        };

        video.src = url;
        video.load();
    });
}