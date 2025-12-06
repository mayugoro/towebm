const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Set ffmpeg and ffprobe path
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * Convert any video/animation to WEBM for Telegram sticker
 * Support: GIF, MP4, MOV, WEBM, AVI, MKV, dll
 * Sesuai dengan panduan sticker Telegram:
 * - Video duration max 3 detik
 * - Resolusi 512x512 px
 * - Format WEBM VP9
 * - Max file size 256 KB
 * 
 * Menggunakan two-pass encoding untuk kualitas maksimal dengan ukuran target
 */
async function videoToWebm(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Get file info dulu
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                return reject(err);
            }

            const duration = metadata.format.duration;
            
            // Kalau durasi lebih dari 3 detik, potong
            const maxDuration = Math.min(duration, 3);
            
            // Hitung target bitrate untuk mencapai ~250 KB (dengan buffer)
            // Formula: (target_size_in_KB * 8) / duration_in_seconds
            const targetSizeKB = 250; // Sedikit di bawah 256 KB untuk buffer
            const targetBitrate = Math.floor((targetSizeKB * 8) / maxDuration);
            
            console.log(`Target bitrate: ${targetBitrate}k for ${maxDuration.toFixed(2)}s video`);

            ffmpeg(inputPath)
                .outputOptions([
                    '-c:v libvpx-vp9',                    // VP9 codec
                    '-pix_fmt yuva420p',                   // Pixel format dengan alpha channel
                    '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', // Resize & pad
                    '-an',                                 // No audio
                    '-t ' + maxDuration,                   // Max 3 detik
                    `-b:v ${targetBitrate}k`,              // Dynamic bitrate berdasarkan durasi
                    `-maxrate ${targetBitrate}k`,          // Max bitrate
                    `-bufsize ${targetBitrate * 2}k`,      // Buffer size
                    '-crf 30',                             // Quality (15-35 bagus, 30 balanced)
                    '-quality good',                       // Encoding quality preset
                    '-speed 0',                            // Speed 0 = best quality (lebih lambat)
                    '-auto-alt-ref 0',                     // Disable altref frames (penting untuk transparency)
                    '-loop 0'                              // Loop untuk sticker
                ])
                .output(outputPath)
                .on('start', (commandLine) => {
                    console.log('FFmpeg process started:', commandLine);
                })
                .on('progress', (progress) => {
                    console.log('Processing: ' + (progress.percent || 0).toFixed(1) + '% done');
                })
                .on('end', () => {
                    // Cek ukuran file
                    const stats = fs.statSync(outputPath);
                    const fileSizeInKB = stats.size / 1024;
                    
                    console.log(`Conversion finished! File size: ${fileSizeInKB.toFixed(2)} KB`);
                    
                    // Kalau lebih dari 256 KB, kompres ulang dengan bitrate lebih rendah
                    if (fileSizeInKB > 256) {
                        console.log('File too large, compressing with lower bitrate...');
                        compressWebm(inputPath, outputPath, maxDuration, resolve, reject);
                    } else {
                        resolve(outputPath);
                    }
                })
                .on('error', (err) => {
                    console.error('Error converting to WEBM:', err);
                    reject(err);
                })
                .run();
        });
    });
}

/**
 * Compress WEBM lebih lanjut kalau ukuran masih terlalu besar
 * Menggunakan bitrate yang lebih rendah tapi tetap menjaga kualitas
 */
function compressWebm(inputPath, outputPath, duration, resolve, reject) {
    const tempOutput = outputPath.replace('.webm', '_temp.webm');
    
    // Hitung bitrate yang lebih rendah untuk pass kedua
    const targetSizeKB = 240; // Target lebih konservatif
    const lowerBitrate = Math.floor((targetSizeKB * 8) / duration);
    
    console.log(`Second pass with lower bitrate: ${lowerBitrate}k`);
    
    ffmpeg(inputPath)
        .outputOptions([
            '-c:v libvpx-vp9',
            '-pix_fmt yuva420p',
            '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-an',
            `-t ${duration}`,
            `-b:v ${lowerBitrate}k`,           // Bitrate lebih rendah tapi calculated
            `-maxrate ${lowerBitrate}k`,
            `-bufsize ${lowerBitrate * 2}k`,
            '-crf 35',                          // Slightly lower quality
            '-quality good',
            '-speed 1',                         // Slightly faster
            '-auto-alt-ref 0',
            '-loop 0'
        ])
        .output(tempOutput)
        .on('end', () => {
            // Replace file lama dengan yang baru
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            fs.renameSync(tempOutput, outputPath);
            
            const stats = fs.statSync(outputPath);
            const fileSizeInKB = stats.size / 1024;
            console.log(`Compressed! New file size: ${fileSizeInKB.toFixed(2)} KB`);
            
            // Kalau masih terlalu besar, coba lagi dengan CRF lebih tinggi
            if (fileSizeInKB > 256) {
                console.log('Still too large, final compression pass...');
                finalCompressWebm(inputPath, outputPath, duration, resolve, reject);
            } else {
                resolve(outputPath);
            }
        })
        .on('error', (err) => {
            console.error('Error compressing WEBM:', err);
            reject(err);
        })
        .run();
}

/**
 * Final compression pass dengan pengaturan paling agresif
 */
function finalCompressWebm(inputPath, outputPath, duration, resolve, reject) {
    const tempOutput = outputPath.replace('.webm', '_final.webm');
    
    // Bitrate sangat rendah untuk memastikan di bawah 256 KB
    const minBitrate = Math.floor((220 * 8) / duration);
    
    console.log(`Final pass with minimum bitrate: ${minBitrate}k`);
    
    ffmpeg(inputPath)
        .outputOptions([
            '-c:v libvpx-vp9',
            '-pix_fmt yuva420p',
            '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-an',
            `-t ${duration}`,
            `-b:v ${minBitrate}k`,
            `-maxrate ${minBitrate}k`,
            `-bufsize ${minBitrate * 2}k`,
            '-crf 45',                          // Lower quality tapi tetap acceptable
            '-quality good',
            '-speed 2',
            '-auto-alt-ref 0',
            '-loop 0'
        ])
        .output(tempOutput)
        .on('end', () => {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            fs.renameSync(tempOutput, outputPath);
            
            const stats = fs.statSync(outputPath);
            const fileSizeInKB = stats.size / 1024;
            console.log(`Final compression! File size: ${fileSizeInKB.toFixed(2)} KB`);
            
            resolve(outputPath);
        })
        .on('error', (err) => {
            console.error('Error in final compression:', err);
            reject(err);
        })
        .run();
}

/**
 * Convert static image (PNG, JPG, JPEG) to WEBM format
 * Hanya mengubah format, bukan menjadikan video
 * Output: WEBM static image 512x512 px, max 256 KB
 */
async function imageToWebm(inputPath, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Converting static image to WEBM format...');
            
            // Process image dengan Sharp
            const imageBuffer = await sharp(inputPath)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
                })
                .webp({
                    quality: 90,
                    lossless: false,
                    effort: 6 // Compression effort (0-6, higher = smaller file)
                })
                .toBuffer();
            
            // Cek ukuran
            let fileSizeInKB = imageBuffer.length / 1024;
            console.log(`Initial size: ${fileSizeInKB.toFixed(2)} KB`);
            
            // Kalau lebih dari 256 KB, kompres lebih agresif
            if (fileSizeInKB > 256) {
                console.log('Image too large, compressing...');
                const compressedBuffer = await sharp(inputPath)
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({
                        quality: 75,
                        lossless: false,
                        effort: 6
                    })
                    .toBuffer();
                
                fileSizeInKB = compressedBuffer.length / 1024;
                console.log(`Compressed size: ${fileSizeInKB.toFixed(2)} KB`);
                
                // Simpan hasil kompresi
                fs.writeFileSync(outputPath, compressedBuffer);
            } else {
                // Simpan dengan kualitas normal
                fs.writeFileSync(outputPath, imageBuffer);
            }
            
            console.log(`Image converted successfully! Final size: ${fileSizeInKB.toFixed(2)} KB`);
            resolve(outputPath);
            
        } catch (err) {
            console.error('Error converting image to WEBM:', err);
            reject(err);
        }
    });
}

/**
 * Validasi file video/animation
 */
function validateVideo(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('File tidak ditemukan');
    }

    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    // Limit ukuran input 50 MB
    if (fileSizeInMB > 50) {
        throw new Error('File terlalu besar (max 50 MB)');
    }

    return true;
}

/**
 * Cek apakah file adalah video/animation/image yang supported
 */
function isSupportedFormat(mimeType, fileName) {
    const supportedMimes = [
        'image/gif',
        'video/mp4',
        'video/quicktime',  // MOV
        'video/webm',
        'video/x-msvideo',  // AVI
        'video/x-matroska', // MKV
        'video/mpeg',
        'image/webp',
        'image/png',        // PNG
        'image/jpeg',       // JPG/JPEG
        'image/jpg'
    ];
    
    const supportedExtensions = ['.gif', '.mp4', '.mov', '.webm', '.avi', '.mkv', '.mpeg', '.mpg', '.webp', '.png', '.jpg', '.jpeg'];
    
    // Cek mime type
    if (mimeType && supportedMimes.some(mime => mimeType.includes(mime))) {
        return true;
    }
    
    // Cek extension
    if (fileName) {
        const ext = path.extname(fileName).toLowerCase();
        if (supportedExtensions.includes(ext)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Cek apakah file adalah gambar static (bukan GIF)
 */
function isStaticImage(mimeType, fileName) {
    const staticImageMimes = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp'
    ];
    
    const staticImageExtensions = ['.png', '.jpg', '.jpeg'];
    
    // Cek mime type
    if (mimeType && staticImageMimes.some(mime => mimeType.includes(mime))) {
        return true;
    }
    
    // Cek extension
    if (fileName) {
        const ext = path.extname(fileName).toLowerCase();
        if (staticImageExtensions.includes(ext)) {
            return true;
        }
    }
    
    return false;
}

module.exports = {
    videoToWebm,
    imageToWebm,
    validateVideo,
    isSupportedFormat,
    isStaticImage
};
