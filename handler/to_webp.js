const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Convert static image (PNG, JPG, JPEG, WEBP) to PNG format
 * Untuk static sticker Telegram
 * Output: PNG 512x512 px, max 256 KB
 */
async function imageToPng(inputPath, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Converting static image to PNG format...');
            
            // Process image dengan Sharp
            const imageBuffer = await sharp(inputPath)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
                })
                .png({
                    compressionLevel: 9, // Max compression (0-9)
                    quality: 90
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
                    .png({
                        compressionLevel: 9,
                        quality: 80
                    })
                    .toBuffer();
                
                fileSizeInKB = compressedBuffer.length / 1024;
                console.log(`Compressed size: ${fileSizeInKB.toFixed(2)} KB`);
                
                // Kalau masih terlalu besar, kompres lagi
                if (fileSizeInKB > 256) {
                    console.log('Still too large, final compression...');
                    const finalBuffer = await sharp(inputPath)
                        .resize(512, 512, {
                            fit: 'contain',
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        })
                        .png({
                            compressionLevel: 9,
                            quality: 70
                        })
                        .toBuffer();
                    
                    fileSizeInKB = finalBuffer.length / 1024;
                    console.log(`Final size: ${fileSizeInKB.toFixed(2)} KB`);
                    fs.writeFileSync(outputPath, finalBuffer);
                } else {
                    fs.writeFileSync(outputPath, compressedBuffer);
                }
            } else {
                // Simpan dengan kualitas normal
                fs.writeFileSync(outputPath, imageBuffer);
            }
            
            console.log(`Image converted successfully! Final size: ${fileSizeInKB.toFixed(2)} KB`);
            resolve(outputPath);
            
        } catch (err) {
            console.error('Error converting image to PNG:', err);
            reject(err);
        }
    });
}

/**
 * Cek apakah file adalah gambar static (bukan GIF/video)
 * HANYA PNG, JPG, JPEG yang dianggap gambar static
 * GIF, WEBP animated, WEBM = video (harus pakai FFmpeg)
 */
function isStaticImage(mimeType, fileName) {
    const staticImageMimes = [
        'image/png',
        'image/jpeg',
        'image/jpg'
    ];
    
    // Exclude video formats dan GIF
    const videoMimes = [
        'image/gif',
        'video/',
        'image/webp'  // WEBP bisa animated, jadi exclude dari static
    ];
    
    const staticImageExtensions = ['.png', '.jpg', '.jpeg'];
    
    // Cek apakah mime type adalah video - kalau iya, bukan static image
    if (mimeType && videoMimes.some(mime => mimeType.includes(mime))) {
        return false;
    }
    
    // Cek mime type untuk static image
    if (mimeType && staticImageMimes.some(mime => mimeType.includes(mime))) {
        return true;
    }
    
    // Cek extension - HANYA PNG/JPG/JPEG
    if (fileName) {
        const ext = path.extname(fileName).toLowerCase();
        if (staticImageExtensions.includes(ext)) {
            return true;
        }
    }
    
    return false;
}

module.exports = {
    imageToPng,
    isStaticImage
};
