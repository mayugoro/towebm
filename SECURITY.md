# 🔒 Keamanan & Best Practices

## ⚠️ PENTING: Token Bot

### Token Bot Anda Mungkin Bocor!

Jika bot tiba-tiba logout atau freeze, kemungkinan besar **token bot Anda sudah bocor** dan digunakan oleh orang lain.

### Cara Revoke Token:

1. Buka [@BotFather](https://t.me/botfather)
2. Ketik `/mybots`
3. Pilih bot Anda
4. Pilih **"API Token"**
5. Pilih **"Revoke current token"**
6. Copy token baru
7. Update file `.env` dengan token baru
8. Restart bot

## 🛡️ Rate Limiting

Bot ini sudah dilengkapi dengan rate limiting untuk mencegah spam:

- **Max 3 konversi per menit** per user
- User yang sedang proses tidak bisa submit lagi hingga selesai
- Cooldown 60 detik setelah mencapai limit

## 📊 Kebijakan Telegram Bot API

### Limits yang Perlu Diperhatikan:

1. **Message Rate Limit**
   - Max 30 pesan per detik untuk semua chat
   - Max 1 pesan per detik per chat pribadi
   - Max 20 pesan per menit per grup

2. **File Size Limits**
   - Download: Max 20 MB (tanpa Bot API server sendiri)
   - Upload: Max 50 MB via file_id, 50 MB via upload
   - Untuk file lebih besar, perlu setup Bot API server sendiri

3. **Processing Time**
   - Timeout 50 detik untuk download file
   - Timeout webhook 60 detik

### Penyebab Bot Dibekukan:

1. ✅ **Token Bocor** - Digunakan di banyak tempat sekaligus
2. ✅ **Spam Behavior** - Mengirim banyak pesan identik
3. ✅ **Rate Limit Violation** - Melebihi batas API calls
4. ✅ **Abuse Reports** - Dilaporkan banyak user
5. ✅ **Invalid Bot Behavior** - Bot tidak sesuai TOS Telegram

## 🔐 Cara Melindungi Bot:

### 1. Jangan Commit File .env

File `.env` sudah ada di `.gitignore`. **JANGAN** hapus atau commit file ini!

```bash
# Cek apakah .env ter-track
git ls-files | grep .env

# Jika ada, remove dari git:
git rm --cached .env
git commit -m "Remove .env from tracking"
git push
```

### 2. Gunakan Environment Variables di Production

Di server production (VPS/Cloud), jangan gunakan file `.env`. Set langsung:

```bash
export BOT_TOKEN="your_token_here"
```

Atau gunakan secrets management service:
- GitHub Secrets (untuk GitHub Actions)
- Heroku Config Vars
- Railway Environment Variables
- Docker secrets

### 3. Monitor Bot Activity

Gunakan logging untuk monitor:

```javascript
// Sudah ada di bot
console.log('Bot started successfully! 🚀');
console.log('Processing video for user:', chatId);
```

### 4. Implement Queue System

Untuk bot dengan traffic tinggi, gunakan queue:
- Bull (Redis-based queue)
- RabbitMQ
- AWS SQS

## 🚨 Troubleshooting

### Bot Tiba-tiba Logout

**Penyebab:** Token digunakan di tempat lain atau sudah expired.

**Solusi:**
1. Revoke token di @BotFather
2. Update token baru di `.env`
3. Restart bot
4. Pastikan tidak ada instance bot lain yang running

### Bot Freeze/Hang

**Penyebab:** Proses FFmpeg terlalu banyak atau memory habis.

**Solusi:**
1. Restart bot
2. Kurangi max concurrent processes
3. Tambah memory server
4. Set timeout untuk FFmpeg

### 429 Too Many Requests

**Penyebab:** Melebihi rate limit Telegram API.

**Solusi:**
1. Rate limiting sudah implemented di bot
2. Tunggu beberapa menit
3. Kurangi frekuensi request

### Bot Diban Permanent

**Penyebab:** Melanggar TOS Telegram berkali-kali.

**Solusi:**
1. Buat bot baru di @BotFather
2. Review TOS: https://core.telegram.org/bots/faq#what-messages-will-my-bot-get
3. Implement semua best practices di atas

## 📝 Best Practices

1. ✅ Selalu validate user input
2. ✅ Implement rate limiting
3. ✅ Handle errors dengan baik
4. ✅ Log semua aktivitas penting
5. ✅ Cleanup resources (temp files, memory)
6. ✅ Tidak store file permanent tanpa izin user
7. ✅ Respek privacy user (hapus file setelah process)
8. ✅ Gunakan graceful shutdown
9. ✅ Monitor bot health
10. ✅ Update dependencies secara berkala

## 🔗 Resources

- [Telegram Bot API Docs](https://core.telegram.org/bots/api)
- [Bot FAQ](https://core.telegram.org/bots/faq)
- [Rate Limits](https://core.telegram.org/bots/faq#broadcasting-to-users)
- [TOS](https://telegram.org/tos)

---

**INGAT:** Jangan share token bot ke siapapun! Treat it like password!
