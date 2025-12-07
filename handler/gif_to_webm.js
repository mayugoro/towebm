const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Set ffmpeg and ffprobe path
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * Get actual duration of GIF by counting frames
 * GIF files don't have duration metadata, so we need to count frames
 */
function getGifActualDuration(gifPath) {
    try {
        // Use ffprobe with -count_frames to get actual frame count
        const cmd = `"${ffprobePath}" -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,r_frame_rate -of json "${gifPath}"`;
        
        const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const data = JSON.parse(output);
        const stream = data.streams[0];
        
        if (stream && stream.nb_read_frames && stream.r_frame_rate) {
            const frames = parseInt(stream.nb_read_frames);
            const [num, den] = stream.r_frame_rate.split('/').map(Number);
            const fps = den ? num / den : num;
            const duration = frames / fps;
            
            console.log(`GIF actual duration: ${frames} frames @ ${fps.toFixed(2)} fps = ${duration.toFixed(2)}s`);
            return duration;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting GIF duration:', error.message);
        return null;
    }
}

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

            let duration = metadata.format.duration;
            let isGif = false;
            
            // Check if this is a GIF
            if (metadata.format.format_name === 'gif' || 
                (metadata.streams[0] && metadata.streams[0].codec_name === 'gif')) {
                isGif = true;
                console.log('GIF file detected');
            }
            
            // Handle GIF atau file tanpa duration metadata di format
            if (!duration || isNaN(duration) || duration === 0 || duration === 'N/A') {
                console.log('No duration in format metadata, checking video stream...');
                
                // Untuk GIF, gunakan method khusus untuk count frames
                if (isGif) {
                    const gifDuration = getGifActualDuration(inputPath);
                    if (gifDuration && gifDuration > 0) {
                        duration = gifDuration;
                    }
                }
                
                // Jika masih belum dapat, coba dari video stream
                if (!duration || duration === 0) {
                    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                    
                    if (videoStream) {
                        // Hitung durasi dari nb_frames dan frame rate
                        if (videoStream.nb_frames && videoStream.nb_frames !== 'N/A' && 
                            videoStream.r_frame_rate && videoStream.r_frame_rate !== 'N/A') {
                            const frames = parseInt(videoStream.nb_frames);
                            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                            const fps = den ? num / den : num;
                            
                            if (frames && fps > 0) {
                                duration = frames / fps;
                                console.log(`Calculated duration from frames: ${frames} frames at ${fps.toFixed(2)} fps = ${duration.toFixed(2)}s`);
                            }
                        }
                        
                        // Jika masih belum dapat, coba dari duration field di stream
                        if ((!duration || duration === 0) && videoStream.duration && videoStream.duration !== 'N/A') {
                            duration = parseFloat(videoStream.duration);
                            console.log(`Got duration from video stream: ${duration.toFixed(2)}s`);
                        }
                    }
                }
                
                // Jika masih tidak dapat, gunakan default konservatif
                if (!duration || isNaN(duration) || duration === 0) {
                    console.log('Still no duration found, using 2.5 seconds default');
                    duration = 2.5;
                }
            } else {
                console.log(`Duration from format metadata: ${duration.toFixed(2)}s`);
            }
            
            // Kalau durasi lebih dari 3 detik, potong
            const maxDuration = Math.min(duration, 3);
            const shouldTrim = duration > 3;
            
            // Hitung target bitrate untuk mencapai ~250 KB (dengan buffer)
            // Formula: (target_size_in_KB * 8) / duration_in_seconds
            const targetSizeKB = 250; // Sedikit di bawah 256 KB untuk buffer
            const targetBitrate = Math.floor((targetSizeKB * 8) / maxDuration);
            
            console.log(`Target bitrate: ${targetBitrate}k for ${maxDuration.toFixed(2)}s video`);
            if (shouldTrim) {
                console.log(`Video will be trimmed from ${duration.toFixed(2)}s to 3s`);
            }

            // Build output options
            const outputOptions = [
                '-c:v libvpx-vp9',                    // VP9 codec
                '-pix_fmt yuva420p',                   // Pixel format dengan alpha channel
                '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', // Resize & pad
                '-an',                                 // No audio
            ];
            
            // Hanya tambahkan -t jika perlu trim (durasi > 3 detik)
            // Untuk GIF dengan durasi <= 3 detik, JANGAN pakai -t (bisa cause 0 duration)
            if (shouldTrim) {
                outputOptions.push('-t 3');
            }
            
            outputOptions.push(
                `-b:v ${targetBitrate}k`,              // Dynamic bitrate berdasarkan durasi
                `-maxrate ${targetBitrate}k`,          // Max bitrate
                `-bufsize ${targetBitrate * 2}k`,      // Buffer size
                '-crf 30',                             // Quality (15-35 bagus, 30 balanced)
                '-quality good',                       // Encoding quality preset
                '-speed 0',                            // Speed 0 = best quality (lebih lambat)
                '-auto-alt-ref 0',                     // Disable altref frames (penting untuk transparency)
                '-loop 0'                              // Loop untuk sticker
            );

            ffmpeg(inputPath)
                .outputOptions(outputOptions)
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
    
    // Build options without -t to avoid 0 duration issue
    const outputOptions = [
        '-c:v libvpx-vp9',
        '-pix_fmt yuva420p',
        '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-an'
    ];
    
    // Only add -t if duration > 3 seconds
    if (duration > 3) {
        outputOptions.push('-t 3');
    }
    
    outputOptions.push(
        `-b:v ${lowerBitrate}k`,           // Bitrate lebih rendah tapi calculated
        `-maxrate ${lowerBitrate}k`,
        `-bufsize ${lowerBitrate * 2}k`,
        '-crf 35',                          // Slightly lower quality
        '-quality good',
        '-speed 1',                         // Slightly faster
        '-auto-alt-ref 0',
        '-loop 0'
    );
    
    ffmpeg(inputPath)
        .outputOptions(outputOptions)
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
    
    // Build options without -t to avoid 0 duration issue
    const outputOptions = [
        '-c:v libvpx-vp9',
        '-pix_fmt yuva420p',
        '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-an'
    ];
    
    // Only add -t if duration > 3 seconds
    if (duration > 3) {
        outputOptions.push('-t 3');
    }
    
    outputOptions.push(
        `-b:v ${minBitrate}k`,
        `-maxrate ${minBitrate}k`,
        `-bufsize ${minBitrate * 2}k`,
        '-crf 45',                          // Lower quality tapi tetap acceptable
        '-quality good',
        '-speed 2',
        '-auto-alt-ref 0',
        '-loop 0'
    );
    
    ffmpeg(inputPath)
        .outputOptions(outputOptions)
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

module.exports = {
    videoToWebm,
    validateVideo,
    isSupportedFormat
};
