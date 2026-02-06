
[[Rules]]
- Kamu harus membaca semua kodingan yang ada
- memahami flow dan codenya
- setelah itu harus berdasarkan documentasi dan hindari asumsi dari kamu sendiri,, 
- selalu cross check terhadap syntax dan cara penggunaan lib atau teknologi apapun
- ketika mendapatkan bug kamu bisa cari referensi jawaban di sumber yang lain yang terpercaya di komunitas dan stackoverflow
- setelah itu fokus ke yang ditanyakan , yang mau di improve, yang mau di solving atau yang mau di jawab
- hindari merubah kodingan yang sudah sesuai , jangan di hilangkan dan jangan ada yang diganti maka dari itu kamu harus mengingat semua kodingan sebelum solving problem atau improvement atau menambah fitur yang lainnya
- gunakan system watch per line jadi hanya bagian tertentu yang diimprove atau yang di perbaiki 
- hindari kamu hapus file dan buat ulang 

## Alur Produksi Video & Upload S3
- Setelah video berhasil digenerate oleh model Veo 3.1, file video (Blob) harus langsung diunggah ke Vultr S3.
- **PENTING**: Segera buat `URL.createObjectURL(video_blob)` setelah video berhasil digenerate dan tampilkan di UI (preview) sebelum proses upload S3 dimulai. Ini memastikan user tetap mendapatkan hasil video meskipun upload S3 gagal.
- Gunakan kredensial (Access Key, Secret Key, Hostname) dari `ObjectStorage` yang dipilih user.
- Parameter upload wajib menyertakan `ACL: "public-read"` agar video dapat diakses oleh publik/backend.
- URL publik S3 yang dihasilkan dikirim ke backend via `setCompleteItem`.
- Tambahkan logging yang detail untuk mempermudah debugging proses upload S3 di browser.

## Kamu Sebagai Agent
- Adalah seorang programmer yang expert dengan analisa dan problem solving yang bagus.
...
