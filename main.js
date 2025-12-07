require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { videoToWebm, validateVideo, isSupportedFormat } = require('./handler/gif_to_webm');
const { imageToPng, isStaticImage } = require('./handler/to_webp');
const { downloadAndConvertToWebm, isTenorUrl } = require('./handler/download_to_webm');

// Bot token dari .env
const token = process.env.BOT_TOKEN;

// Validasi token
if (!token) {
    console.error('ERROR: BOT_TOKEN tidak ditemukan di file .env!');
    console.error('Silakan buat file .env dan isi dengan: BOT_TOKEN=your_bot_token_here');
    process.exit(1);
}

// Create bot instance dengan polling configuration
const bot = new TelegramBot(token, { 
    polling: {
        interval: 1000,  // Polling interval 1 detik
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// Rate limiting - track user requests
const userRequests = new Map();
const MAX_REQUESTS_PER_MINUTE = 3; // Max 3 konversi per menit per user
const COOLDOWN_TIME = 60000; // 1 menit dalam milliseconds

// Processing queue - track ongoing processes
const processingUsers = new Set();

// Buat folder temp kalau belum ada
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

console.log('Bot started successfully! 🚀');
console.log('Polling for messages...');

// Command /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🎨 *Selamat Datang di Video to WEBM Bot!*

Bot ini mengkonversi video/animasi ke WEBM dan gambar ke WEBP untuk sticker Telegram dengan spesifikasi:
✅ Resolusi 512x512 px
✅ Durasi max 3 detik
✅ Format WEBM VP9
✅ Ukuran max 256 KB

*Format yang Didukung:*
🎬 Video: GIF, MP4, MOV, WEBM, AVI, MKV, MPEG → WEBM
🖼️ Gambar: PNG, JPG, JPEG, WEBP → PNG
👍 Sticker (WEBP static, WEBM video)
🔗 URL Tenor (langsung download & convert!)

*Cara Penggunaan:*
1. Kirim video/GIF/sticker ke bot, atau
2. Kirim link Tenor (tenor.com/view/...)
3. Tunggu proses konversi
4. Download file WEBM hasil konversi
5. Forward ke @Stickers untuk buat pack!

*Contoh URL Tenor:*
\`tenor.com/view/cute-panda-gif-123456\`
\`https://tenor.com/view/cute-panda-gif-123456\`

*Commands:*
/start - Tampilkan pesan ini
/help - Bantuan penggunaan

Kirim video/sticker atau link Tenor sekarang! 🎬
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Command /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 *Bantuan - Video to WEBM Bot*

*Cara Menggunakan:*
1. Kirim video/GIF/sticker ke bot
2. Bot akan otomatis mengkonversi ke WEBM video sticker
3. File WEBM akan dikirim kembali ke Anda
4. Forward ke @Stickers untuk membuat sticker pack

*Format yang Didukung:*
• Video: GIF, MP4, MOV, WEBM, AVI, MKV, MPEG (konversi ke WEBM)
• Gambar: PNG, JPG, JPEG, WEBP (konversi ke PNG)
• Sticker: WEBP (static), WEBM (video)
• URL Tenor: Kirim link Tenor langsung! (tenor.com/view/...)
• Ukuran maksimal: 50 MB
• Akan dikonversi ke 512x512 px
• Durasi dibatasi 3 detik

*Tips:*
• Video/sticker dengan background transparan memberikan hasil terbaik
• Video dengan durasi > 3 detik akan dipotong otomatis
• Sticker static (WEBP) akan dikonversi ke format video sticker
• File hasil bisa langsung digunakan untuk video sticker Telegram
• Max 3 konversi per menit untuk mencegah spam
• Untuk Tenor: Kirim link seperti tenor.com/view/name-gif-123456

Ada masalah? Cek dokumentasi di GitHub!
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});



// Handler untuk menerima dokumen (semua format video dan gambar)
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const document = msg.document;
    
    // Cek apakah file format yang didukung
    if (!isSupportedFormat(document.mime_type, document.file_name)) {
        return bot.sendMessage(chatId, '❌ Format tidak didukung! Kirim file: Video (GIF, MP4, MOV, WEBM, AVI, MKV, MPEG) atau Gambar (PNG, JPG, JPEG, WEBP)');
    }
    
    // Cek ukuran file
    const fileSizeInMB = document.file_size / (1024 * 1024);
    if (fileSizeInMB > 50) {
        return bot.sendMessage(chatId, '❌ File terlalu besar! Maksimal 50 MB');
    }
    
    // Cek apakah ini gambar static atau video
    const isImage = isStaticImage(document.mime_type, document.file_name);
    
    if (isImage) {
        // Gambar static -> konversi ke WEBP
        await processImage(chatId, document.file_id, document.file_name || 'image');
    } else {
        // Video/GIF -> konversi ke WEBM
        await processVideo(chatId, document.file_id, document.file_name || 'video');
    }
});

// Handler untuk menerima animation (GIF/video yang dikirim sebagai animation)
bot.on('animation', async (msg) => {
    const chatId = msg.chat.id;
    const animation = msg.animation;
    
    await processVideo(chatId, animation.file_id, animation.file_name || 'animation');
});

// Handler untuk menerima photo (gambar yang dikirim sebagai photo)
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const photo = msg.photo;
    
    // Ambil foto dengan resolusi tertinggi
    const largestPhoto = photo[photo.length - 1];
    
    await processImage(chatId, largestPhoto.file_id, 'photo.jpg');
});

// Handler untuk menerima video
bot.on('video', async (msg) => {
    const chatId = msg.chat.id;
    const video = msg.video;
    
    // Cek ukuran file
    const fileSizeInMB = video.file_size / (1024 * 1024);
    if (fileSizeInMB > 50) {
        return bot.sendMessage(chatId, '❌ File terlalu besar! Maksimal 50 MB');
    }
    
    await processVideo(chatId, video.file_id, video.file_name || 'video.mp4');
});

// Handler untuk menerima sticker (WEBP/TGS/WEBM)
bot.on('sticker', async (msg) => {
    const chatId = msg.chat.id;
    const sticker = msg.sticker;
    
    // Telegram stickers bisa berupa: WEBP (static), TGS (animated Lottie), atau WEBM (video)
    let fileType = 'static';
    let fileName = 'sticker.webp';
    
    if (sticker.is_animated) {
        // TGS (Lottie) animated stickers
        return bot.sendMessage(chatId, 
            '❌ Sticker TGS (Lottie animated) tidak bisa langsung dikonversi.\n\n' +
            '💡 Solusi:\n' +
            '1. Convert TGS ke video dulu menggunakan:\n' +
            '   • @tgstovideo_bot\n' +
            '   • ezgif.com/tgs-to-video\n' +
            '2. Kirim hasil video ke bot ini\n\n' +
            'Atau kirim sticker WEBP (static) atau WEBM (video) langsung!'
        );
    } else if (sticker.is_video) {
        fileType = 'video';
        fileName = 'sticker.webm';
    }
    
    await processVideo(chatId, sticker.file_id, fileName);
});

// Handler untuk text message (URL Tenor)
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Skip jika command
    if (text.startsWith('/')) {
        return;
    }
    
    // Cek apakah text adalah URL Tenor
    if (!isTenorUrl(text)) {
        return bot.sendMessage(chatId, 
            '❓ Tidak dikenali sebagai URL Tenor.\n\n' +
            '💡 *Cara Menggunakan:*\n' +
            '• Kirim video/GIF/sticker langsung, atau\n' +
            '• Kirim link Tenor seperti:\n' +
            '  `tenor.com/view/name-gif-123456`\n' +
            '  `https://tenor.com/view/name-gif-123456`\n\n' +
            'Gunakan /help untuk bantuan lengkap!',
            { parse_mode: 'Markdown' }
        );
    }
    
    // Process URL Tenor
    await processTenorUrl(chatId, text);
});

/**
 * Check rate limit untuk user
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userHistory = userRequests.get(userId) || [];
    
    // Hapus request yang sudah lebih dari 1 menit
    const recentRequests = userHistory.filter(time => now - time < COOLDOWN_TIME);
    
    if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
        const oldestRequest = recentRequests[0];
        const waitTime = Math.ceil((COOLDOWN_TIME - (now - oldestRequest)) / 1000);
        return { allowed: false, waitTime };
    }
    
    // Update request history
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    
    return { allowed: true };
}

/**
 * Process Image conversion (static image to WEBM)
 */
async function processImage(chatId, fileId, fileName) {
    let processingMsg;
    let inputPath;
    let outputPath;
    
    try {
        // Check if user is already processing
        if (processingUsers.has(chatId)) {
            return bot.sendMessage(chatId, '⚠️ Anda masih memiliki proses konversi yang berjalan. Tunggu hingga selesai!');
        }
        
        // Check rate limit
        const rateLimit = checkRateLimit(chatId);
        if (!rateLimit.allowed) {
            return bot.sendMessage(chatId, `⏱️ Terlalu banyak request! Silakan tunggu ${rateLimit.waitTime} detik lagi.`);
        }
        
        // Mark user as processing
        processingUsers.add(chatId);
        
        // Send processing message
        processingMsg = await bot.sendMessage(chatId, '⏳ Memproses gambar Anda...');
        
        // Download file dari Telegram
        const fileLink = await bot.getFileLink(fileId);
        
        // Generate unique filename
        const timestamp = Date.now();
        const inputFileName = `${timestamp}_${fileName}`;
        inputPath = path.join(tempDir, inputFileName);
        outputPath = path.join(tempDir, `${timestamp}_output.png`);
        
        // Download file
        await bot.editMessageText('📥 Downloading image...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        const response = await axios({
            method: 'GET',
            url: fileLink,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        // Convert to PNG (static)
        await bot.editMessageText('🔄 Converting image to PNG format...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        await imageToPng(inputPath, outputPath);
        
        // Send hasil konversi
        await bot.editMessageText('📤 Mengirim file...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        const stats = fs.statSync(outputPath);
        const fileSizeInKB = (stats.size / 1024).toFixed(2);
        
        // Kirim sebagai document
        await bot.sendDocument(chatId, outputPath, {
            caption: `✅ Konversi berhasil!

📦 Ukuran: ${fileSizeInKB} KB
📐 Resolusi: 512x512 px
🖼️ Format: PNG (static image)

📌 Gambar PNG siap digunakan untuk sticker Telegram! 🎉`
        });
        
        // Delete processing message
        await bot.deleteMessage(chatId, processingMsg.message_id);
        
    } catch (error) {
        console.error('Error processing image:', error);
        
        const errorMsg = '❌ Terjadi kesalahan saat memproses gambar!\n\n' + error.message;
        
        if (processingMsg) {
            try {
                await bot.editMessageText(errorMsg, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id
                });
            } catch (e) {
                await bot.sendMessage(chatId, errorMsg);
            }
        } else {
            await bot.sendMessage(chatId, errorMsg);
        }
    } finally {
        // Remove user from processing set
        processingUsers.delete(chatId);
        
        // Cleanup temp files
        try {
            if (inputPath && fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }
            if (outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (err) {
            console.error('Error cleaning up temp files:', err);
        }
    }
}

/**
 * Process Video/Animation conversion
 */
async function processVideo(chatId, fileId, fileName) {
    let processingMsg;
    let inputPath;
    let outputPath;
    
    try {
        // Check if user is already processing
        if (processingUsers.has(chatId)) {
            return bot.sendMessage(chatId, '⚠️ Anda masih memiliki proses konversi yang berjalan. Tunggu hingga selesai!');
        }
        
        // Check rate limit
        const rateLimit = checkRateLimit(chatId);
        if (!rateLimit.allowed) {
            return bot.sendMessage(chatId, `⏱️ Terlalu banyak request! Silakan tunggu ${rateLimit.waitTime} detik lagi.`);
        }
        
        // Mark user as processing
        processingUsers.add(chatId);
        
        // Send processing message
        processingMsg = await bot.sendMessage(chatId, '⏳ Memproses video Anda...');
        
        // Download file dari Telegram
        const fileLink = await bot.getFileLink(fileId);
        
        // Generate unique filename
        const timestamp = Date.now();
        const inputFileName = `${timestamp}_${fileName}`;
        inputPath = path.join(tempDir, inputFileName);
        outputPath = path.join(tempDir, `${timestamp}_output.webm`);
        
        // Download file
        await bot.editMessageText('📥 Downloading file...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        const response = await axios({
            method: 'GET',
            url: fileLink,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        // Cek apakah file adalah gambar static atau video
        const isImage = isStaticImage(null, fileName);
        
        if (isImage) {
            // Process sebagai gambar static
            await bot.editMessageText('🔄 Converting image to PNG format...', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            
            await imageToPng(inputPath, outputPath);
        } else {
            // Validate video
            validateVideo(inputPath);
            
            // Convert to WEBM (video)
            await bot.editMessageText('🔄 Converting to WEBM for Telegram sticker...', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            
            await videoToWebm(inputPath, outputPath);
        }
        
        // Send hasil konversi
        await bot.editMessageText('📤 Mengirim file...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        const stats = fs.statSync(outputPath);
        const fileSizeInKB = (stats.size / 1024).toFixed(2);
        
        // Rename file dengan nama yang diterima @Stickers bot
        const finalFileName = isImage ? 'image_sticker.png' : 'video_sticker.webm';
        const finalOutputPath = path.join(tempDir, finalFileName);
        if (fs.existsSync(finalOutputPath)) {
            fs.unlinkSync(finalOutputPath);
        }
        fs.renameSync(outputPath, finalOutputPath);
        
        // Kirim sesuai tipe file
        if (isImage) {
            // Kirim sebagai document untuk gambar static
            await bot.sendDocument(chatId, finalOutputPath, {
                caption: `✅ Konversi berhasil!\n\n📦 Ukuran: ${fileSizeInKB} KB\n📐 Resolusi: 512x512 px\n🖼️ Format: WEBP (static image)\n\n📌 Gambar WEBP siap digunakan untuk sticker Telegram! 🎉`
            });
        } else {
            // Kirim sebagai video dengan parameter khusus untuk sticker
            await bot.sendVideo(chatId, finalOutputPath, {
                caption: `✅ Konversi berhasil!\n\n📦 Ukuran: ${fileSizeInKB} KB\n📐 Resolusi: 512x512 px\n⏱ Durasi: Max 3 detik\n🎬 Format: WEBM VP9\n\n📌 Forward file ini ke @Stickers untuk membuat sticker pack!\n\nFile siap digunakan untuk sticker Telegram! 🎉`,
                supports_streaming: true
            });
        }
        
        // Update outputPath untuk cleanup
        outputPath = finalOutputPath;
        
        // Delete processing message
        await bot.deleteMessage(chatId, processingMsg.message_id);
        
    } catch (error) {
        console.error('Error processing video:', error);
        
        const errorMsg = '❌ Terjadi kesalahan saat memproses video!\n\n' + error.message;
        
        if (processingMsg) {
            try {
                await bot.editMessageText(errorMsg, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id
                });
            } catch (e) {
                // Jika edit gagal, kirim pesan baru
                await bot.sendMessage(chatId, errorMsg);
            }
        } else {
            await bot.sendMessage(chatId, errorMsg);
        }
    } finally {
        // Remove user from processing set
        processingUsers.delete(chatId);
        
        // Cleanup temp files
        try {
            if (inputPath && fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }
            if (outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (err) {
            console.error('Error cleaning up temp files:', err);
        }
    }
}

/**
 * Process Tenor URL
 */
async function processTenorUrl(chatId, tenorUrl) {
    let processingMsg;
    let outputPath;
    
    try {
        // Check if user is already processing
        if (processingUsers.has(chatId)) {
            return bot.sendMessage(chatId, '⚠️ Anda masih memiliki proses konversi yang berjalan. Tunggu hingga selesai!');
        }
        
        // Check rate limit
        const rateLimit = checkRateLimit(chatId);
        if (!rateLimit.allowed) {
            return bot.sendMessage(chatId, `⏱️ Terlalu banyak request! Silakan tunggu ${rateLimit.waitTime} detik lagi.`);
        }
        
        // Mark user as processing
        processingUsers.add(chatId);
        
        // Send processing message
        processingMsg = await bot.sendMessage(chatId, '⏳ Memproses link Tenor Anda...');
        
        // Generate output path
        const timestamp = Date.now();
        outputPath = path.join(tempDir, `${timestamp}_tenor_output.webm`);
        
        // Update status: Extracting Tenor ID
        await bot.editMessageText('🔍 Mengambil data dari Tenor...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        // Download dan konversi menggunakan modul download_to_webm
        await bot.editMessageText('📥 Downloading GIF dari Tenor...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        // Update progress saat converting
        const progressInterval = setInterval(async () => {
            try {
                await bot.editMessageText('🔄 Converting GIF to WEBM...', {
                    chat_id: chatId,
                    message_id: processingMsg.message_id
                });
            } catch (e) {
                // Ignore error jika message sudah diedit
            }
        }, 3000);
        
        // Download and convert
        await downloadAndConvertToWebm(tenorUrl, outputPath, tempDir);
        
        // Stop progress updates
        clearInterval(progressInterval);
        
        // Send hasil konversi
        await bot.editMessageText('📤 Mengirim file...', {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });
        
        const stats = fs.statSync(outputPath);
        const fileSizeInKB = (stats.size / 1024).toFixed(2);
        
        // Rename file dengan nama yang diterima @Stickers bot
        const finalFileName = 'tenor_sticker.webm';
        const finalOutputPath = path.join(tempDir, `${timestamp}_${finalFileName}`);
        if (fs.existsSync(finalOutputPath)) {
            fs.unlinkSync(finalOutputPath);
        }
        fs.renameSync(outputPath, finalOutputPath);
        
        // Kirim sebagai video dengan parameter khusus untuk sticker
        await bot.sendVideo(chatId, finalOutputPath, {
            caption: `✅ Konversi dari Tenor berhasil!\n\n📦 Ukuran: ${fileSizeInKB} KB\n📐 Resolusi: 512x512 px\n⏱ Durasi: Max 3 detik\n🎬 Format: WEBM VP9\n\n📌 Forward file ini ke @Stickers untuk membuat sticker pack!\n\nFile siap digunakan untuk sticker Telegram! 🎉`,
            supports_streaming: true
        });
        
        // Update outputPath untuk cleanup
        outputPath = finalOutputPath;
        
        // Delete processing message
        await bot.deleteMessage(chatId, processingMsg.message_id);
        
    } catch (error) {
        console.error('Error processing Tenor URL:', error);
        
        let errorMsg = '❌ Terjadi kesalahan saat memproses URL Tenor!\n\n';
        
        // Custom error messages
        if (error.message.includes('Format URL Tenor tidak valid')) {
            errorMsg += '🔗 Format URL tidak valid!\n\n' +
                       '💡 Contoh URL yang benar:\n' +
                       '• tenor.com/view/name-gif-123456\n' +
                       '• https://tenor.com/view/name-gif-123456\n' +
                       '• https://tenor.com/id/view/name-gif-123456';
        } else if (error.message.includes('GIF tidak ditemukan')) {
            errorMsg += '❌ GIF tidak ditemukan di Tenor!\n\n' +
                       'Pastikan link yang Anda kirim benar dan masih aktif.';
        } else if (error.message.includes('Tenor API Error')) {
            errorMsg += '⚠️ Gagal mengakses Tenor API!\n\n' +
                       'Coba lagi beberapa saat atau gunakan link yang berbeda.';
        } else if (error.message.includes('terlalu besar')) {
            errorMsg += error.message;
        } else {
            errorMsg += error.message;
        }
        
        if (processingMsg) {
            try {
                await bot.editMessageText(errorMsg, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id
                });
            } catch (e) {
                // Jika edit gagal, kirim pesan baru
                await bot.sendMessage(chatId, errorMsg);
            }
        } else {
            await bot.sendMessage(chatId, errorMsg);
        }
    } finally {
        // Remove user from processing set
        processingUsers.delete(chatId);
        
        // Cleanup temp files
        try {
            if (outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (err) {
            console.error('Error cleaning up temp files:', err);
        }
    }
}

// Error handling untuk polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code);
    
    // Handle specific errors
    if (error.code === 'ETELEGRAM') {
        console.error('Telegram API Error:', error.response?.body);
    } else if (error.code === 'EFATAL') {
        console.error('Fatal error - bot mungkin diblokir atau token invalid!');
        console.error('Silakan cek token bot Anda di @BotFather');
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down bot...');
    console.log('Stopping polling...');
    bot.stopPolling();
    
    // Clear all temp files
    try {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
            fs.unlinkSync(path.join(tempDir, file));
        });
        console.log('Temp files cleaned up');
    } catch (err) {
        console.error('Error cleaning temp files:', err);
    }
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down bot...');
    bot.stopPolling();
    process.exit(0);
});
