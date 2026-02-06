
# Mabar UGC AI Studio - Feature & Flow Documentation

## 1. Authentication & Persistence Flow
...

## 2. UGC Video Generation Pipeline
1. **Initialization**: Validasi input brief, produk, dan karakter.
   - **Endpoint**: `/ugc` (POST)
2. **Storyboard Generation**: 
   - Looping request ke Gemini (`STORYBOARD` model) hingga total durasi scene memenuhi `min_duration`.
   - Mengirim hasil **JSON array** storyboard (bukan string) ke endpoint `/story_board`.
3. **Asset Standardization**: 
   - Cropping gambar produk dan karakter menggunakan Canvas API agar sesuai dengan `aspect_ratio`.
   - **Fix CORS Proxy**: Menggunakan **Proxy Fetcher** dengan format **Path Concatenation**.
4. **Image First Scene Generation**:
   - Injeksi **Photography Prompt**.
   - Upload hasil ke endpoint `/scene_image_first`.
5. **Video Generation**:
   - Menggunakan model `VIDEO` (Veo 3.1). Polling hingga status video `done`.
6. **Local Preview Generation**:
   - Segera setelah video blob diterima, sistem membuat `Blob URL` lokal untuk preview instan di Production Pipeline.
7. **S3 Upload (Vultr)**:
   - Video Blob diunggah ke S3 menggunakan `s3Service`.
   - Menggunakan `ACL: "public-read"` dan `ContentType: "video/mp4"`.
   - Menggunakan kredensial dinamis dari pilihan `ObjectStorage`.
   - Jika upload gagal, status item diset `FAILED` tapi preview video lokal tetap dapat diputar/didownload oleh user.
8. **Completion**: 
   - URL publik dari S3 dikirim ke backend via endpoint `/complete`.

## 3. Error Reporting Standards
...
