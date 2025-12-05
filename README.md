# 🎬 Telegram Video to WEBM Bot

Bot Telegram untuk mengkonversi video/animasi ke WEBM sesuai dengan standar sticker Telegram terbaru.

## ✨ Fitur

- ✅ Konversi berbagai format video ke WEBM format VP9
- ✅ Support: GIF, MP4, MOV, WEBM, AVI, MKV, MPEG, WEBP
- ✅ Otomatis resize ke 512x512 px
- ✅ Batasi durasi maksimal 3 detik
- ✅ Kompres file hingga max 256 KB
- ✅ Support transparency (alpha channel)
- ✅ Auto-loop untuk sticker
- ✅ Download langsung dari Telegram
- ✅ Cleanup otomatis file temporary

## 📋 Persyaratan

- Node.js v14 atau lebih tinggi
- NPM atau Yarn
- Bot Token dari [@BotFather](https://t.me/botfather)

## 🚀 Instalasi

1. Clone atau download project ini

2. Install dependencies:
```bash
npm install
```

3. Buat file `.env` dan isi dengan:
```env
BOT_TOKEN=your_bot_token_here
```

4. Jalankan bot:
```bash
npm start
```

## 📦 Dependencies

- `node-telegram-bot-api` - Library untuk Telegram Bot API
- `fluent-ffmpeg` - FFmpeg wrapper untuk Node.js
- `ffmpeg-static` - FFmpeg binary static
- `axios` - HTTP client untuk download file
- `dotenv` - Environment variables manager

## 🎯 Cara Penggunaan

1. Start bot dengan command `/start`
2. Kirim file video/GIF ke bot (sebagai document, animation, atau video)
3. Format yang didukung: GIF, MP4, MOV, WEBM, AVI, MKV, MPEG, WEBP
4. Tunggu proses konversi selesai
5. Download file WEBM hasil konversi
6. Gunakan untuk membuat sticker Telegram!

## 📝 Commands

- `/start` - Menampilkan welcome message
- `/help` - Bantuan penggunaan bot

## ⚙️ Spesifikasi Output

- **Format**: WEBM (VP9 codec)
- **Resolusi**: 512x512 px
- **Durasi**: Maksimal 3 detik
- **Ukuran File**: Maksimal 256 KB
- **Pixel Format**: yuva420p (dengan alpha channel)
- **Loop**: Enabled

## 📁 Struktur Project

```
├── main.js                 # File utama bot
├── handler/
│   └── gif_to_webm.js     # Handler konversi GIF to WEBM
├── idea/
│   └── idea.md            # Dokumentasi ide project
├── temp/                   # Folder temporary (auto-created)
├── .env                    # Environment variables
├── package.json            # NPM dependencies
└── README.md              # Dokumentasi ini
```

## 🔧 Konfigurasi FFmpeg

Bot menggunakan `ffmpeg-static` yang sudah include binary FFmpeg, jadi tidak perlu install FFmpeg secara manual.

### Parameter Konversi:

- `-c:v libvpx-vp9` - Video codec VP9
- `-pix_fmt yuva420p` - Pixel format dengan alpha channel
- `-vf scale=512:512` - Resize dan padding ke 512x512
- `-an` - Tanpa audio
- `-t 3` - Durasi maksimal 3 detik
- `-b:v 256k` - Bitrate untuk kontrol ukuran file
- `-auto-alt-ref 0` - Setting untuk VP9
- `-loop 0` - Enable looping

## 🛡️ Error Handling

Bot sudah dilengkapi dengan error handling untuk:
- File format tidak didukung
- File terlalu besar (> 50 MB)
- Error saat download
- Error saat konversi
- Auto cleanup file temporary

## 👨‍💻 Development

Untuk development mode:
```bash
npm run dev
```

## 📝 TODO / Improvement Ideas

- [ ] Tambah progress bar saat konversi
- [ ] Support batch conversion (multiple files)
- [ ] Custom duration setting
- [ ] Preview before convert
- [ ] Statistics tracking
- [ ] Multi-language support

## 🤝 Contributing

Feel free to contribute dengan membuat pull request atau membuka issue!

## 📄 License

ISC

## 👤 Author

Dibuat oleh [orang ini](https://t.me/Mayugoro) untuk mempermudah membuat sticker telegram

---

**Note**: Pastikan bot token Anda aman dan jangan share ke publik!
