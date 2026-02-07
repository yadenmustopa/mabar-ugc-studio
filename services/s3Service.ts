import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { FetchHttpHandler } from "@aws-sdk/fetch-http-handler";
import type { ObjectStorage } from "../types";

/**
 * S3 Service (Browser Safe)
 */
export const s3Service = {
  async uploadVideoToS3(
      videoBlob: Blob,
      storage: ObjectStorage,
      bucket: string,
      filename: string
  ): Promise<string> {
    console.log(
        `[S3Service] Upload -> https://${storage.s3_hostname}/${bucket}/${filename}`
    );

    /**
     * 🔥 INI KUNCI UTAMANYA
     * Paksa AWS SDK pakai Fetch (browser),
     * bukan NodeHttpHandler (fs)
     */
    const client = new S3Client({
      region: "us-east-1",
      endpoint: `https://${storage.s3_hostname}`,
      forcePathStyle: true,

      credentials: {
        accessKeyId: storage.s3_access_key,
        secretAccessKey: storage.s3_secret_key,
      },

      requestHandler: new FetchHttpHandler({
        keepAlive: false,
      }),
    });

    try {
      // Blob → Uint8Array (browser safest)
      const body = new Uint8Array(await videoBlob.arrayBuffer());

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: body,
        ContentType: "video/mp4",
        ACL: "public-read",
      });

      await client.send(command);

      const publicUrl = `https://${storage.s3_hostname}/${bucket}/${filename}`;

      console.log("[S3Service] Upload SUCCESS:", publicUrl);

      return publicUrl;
    } catch (err: any) {
      console.error("[S3Service] Upload FAILED:", err);
      throw new Error(
          `Gagal mengunggah video ke S3: ${err?.message || err}`
      );
    }
  },
};
