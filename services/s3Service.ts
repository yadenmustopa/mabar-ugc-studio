
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ObjectStorage } from "../types";

/**
 * Service untuk menangani interaksi dengan S3 Compatible Storage (Vultr)
 */
export const s3Service = {
  /**
   * Mengunggah file (Blob) ke S3 dengan ACL public-read
   */
  uploadVideoToS3: async (
    videoBlob: Blob,
    storage: ObjectStorage,
    bucket: string,
    filename: string
  ): Promise<string> => {
    console.log(`[S3Service] Memulai upload ke ${storage.s3_hostname}/${bucket}/${filename}`);
    
    // 1. Inisialisasi S3 Client dengan konfigurasi eksplisit untuk browser
    // Menghindari default credential provider chain yang mencoba membaca file system (fs.readFile)
    const client = new S3Client({
      region: "us-east-1", 
      endpoint: `https://${storage.s3_hostname}`,
      credentials: {
        accessKeyId: storage.s3_access_key,
        secretAccessKey: storage.s3_secret_key,
      },
      forcePathStyle: true, 
    });

    try {
      // 2. Konversi Blob ke Uint8Array (Metode paling aman untuk browser compatibility di AWS SDK v3)
      const arrayBuffer = await videoBlob.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      console.log(`[S3Service] Payload size: ${body.length} bytes`);

      // 3. Persiapkan Command Upload dengan ACL public-read
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: body,
        ContentType: "video/mp4",
        ACL: "public-read",
      });

      // 4. Eksekusi Upload
      const response = await client.send(command);
      console.log("[S3Service] Upload Success:", response);
      
      // 5. Kembalikan URL publik hasil upload
      return `https://${storage.s3_hostname}/${bucket}/${filename}`;
    } catch (error) {
      console.error("[S3Service] Critical Upload Error:", error);
      // Deteksi error spesifik unenv / Node compatibility
      if ((error as any).message?.includes("fs.readFile")) {
        throw new Error("S3 Client Error: Masalah kompatibilitas browser/bundler. Menggunakan fallback upload mungkin diperlukan.");
      }
      throw new Error(`Gagal mengunggah video ke S3: ${(error as Error).message}`);
    }
  }
};
