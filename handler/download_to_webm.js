const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { videoToWebm } = require('./gif_to_webm');

/**
 * Extract Tenor GIF ID dari URL
 * Support format:
 * - https://tenor.com/id/view/tkthao219-bubududu-panda-gif-22554080
 * - tenor.com/id/view/tkthao219-bubududu-panda-gif-22554080
 * - https://tenor.com/view/tkthao219-bubududu-panda-gif-22554080
 * - https://c.tenor.com/...
 */
function extractTenorId(url) {
    // Tambahkan https:// jika tidak ada
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    // Extract ID dari berbagai format URL Tenor
    const patterns = [
        /tenor\.com\/(?:id\/)?view\/[^\/]+-(\d+)$/,  // /view/name-123456
        /tenor\.com\/(?:id\/)?view\/.*-(\d+)$/,      // /view/anything-123456
        /tenor\.com\/.*\/(\d+)$/,                      // /anything/123456
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    throw new Error('Format URL Tenor tidak valid! Kirim link seperti: tenor.com/view/name-gif-123456');
}

/**
 * Mendapatkan URL GIF dari Tenor menggunakan ID
 * Menggunakan Tenor API v2 (tanpa API key untuk basic usage)
 */
async function getTenorGifUrl(tenorId) {
    try {
        // Tenor API v2 endpoint (public, tidak perlu API key untuk basic)
        // Format: https://g.tenor.com/v2/posts?ids={id}
        const apiUrl = `https://tenor.googleapis.com/v2/posts?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&ids=${tenorId}`;
        
        const response = await axios.get(apiUrl);
        
        if (!response.data || !response.data.results || response.data.results.length === 0) {
            throw new Error('GIF tidak ditemukan di Tenor');
        }
        
        const gifData = response.data.results[0];
        
        // Ambil URL GIF dengan kualitas terbaik
        // Priority: gif -> mediumgif -> tinygif
        const media = gifData.media_formats;
        let gifUrl = null;
        
        if (media.gif && media.gif.url) {
            gifUrl = media.gif.url;
        } else if (media.mediumgif && media.mediumgif.url) {
            gifUrl = media.mediumgif.url;
        } else if (media.tinygif && media.tinygif.url) {
            gifUrl = media.tinygif.url;
        }
        
        if (!gifUrl) {
            throw new Error('URL GIF tidak ditemukan dalam response Tenor');
        }
        
        return {
            url: gifUrl,
            title: gifData.content_description || 'tenor_gif',
            id: tenorId
        };
        
    } catch (error) {
        if (error.response) {
            // API Error
            console.error('Tenor API Error:', error.response.status, error.response.data);
            throw new Error(`Tenor API Error: ${error.response.status}`);
        } else if (error.request) {
            // Network Error
            throw new Error('Tidak dapat terhubung ke Tenor. Cek koneksi internet Anda!');
        } else {
            throw error;
        }
    }
}

/**
 * Download GIF dari URL
 */
async function downloadGif(gifUrl, outputPath) {
    const response = await axios({
        method: 'GET',
        url: gifUrl,
        responseType: 'stream',
        timeout: 30000 // 30 detik timeout
    });
    
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Main function: Download dari Tenor dan konversi ke WEBM
 * @param {string} tenorUrl - URL Tenor (dengan atau tanpa https://)
 * @param {string} outputPath - Path output file WEBM
 * @param {string} tempDir - Directory untuk file temporary
 * @returns {Promise<string>} Path ke file WEBM hasil konversi
 */
async function downloadAndConvertToWebm(tenorUrl, outputPath, tempDir) {
    let tempGifPath = null;
    
    try {
        // 1. Extract Tenor ID dari URL
        const tenorId = extractTenorId(tenorUrl);
        console.log(`Tenor ID: ${tenorId}`);
        
        // 2. Dapatkan URL GIF dari Tenor API
        const gifData = await getTenorGifUrl(tenorId);
        console.log(`GIF URL: ${gifData.url}`);
        console.log(`GIF Title: ${gifData.title}`);
        
        // 3. Download GIF
        const timestamp = Date.now();
        tempGifPath = path.join(tempDir, `${timestamp}_tenor_${tenorId}.gif`);
        
        console.log('Downloading GIF from Tenor...');
        await downloadGif(gifData.url, tempGifPath);
        
        // Cek ukuran file
        const stats = fs.statSync(tempGifPath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`Downloaded GIF size: ${fileSizeInMB.toFixed(2)} MB`);
        
        if (fileSizeInMB > 50) {
            throw new Error('GIF terlalu besar (max 50 MB)');
        }
        
        // 4. Konversi ke WEBM menggunakan fungsi existing
        console.log('Converting GIF to WEBM...');
        await videoToWebm(tempGifPath, outputPath);
        
        console.log(`Conversion complete: ${outputPath}`);
        
        return outputPath;
        
    } finally {
        // Cleanup: hapus file GIF temporary
        if (tempGifPath && fs.existsSync(tempGifPath)) {
            try {
                fs.unlinkSync(tempGifPath);
                console.log('Temp GIF file cleaned up');
            } catch (err) {
                console.error('Error deleting temp GIF:', err);
            }
        }
    }
}

/**
 * Validasi apakah string adalah URL Tenor yang valid
 */
function isTenorUrl(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    
    // Normalize: tambahkan https:// jika tidak ada
    const normalized = text.startsWith('http') ? text : 'https://' + text;
    
    // Cek apakah mengandung tenor.com
    return /tenor\.com/i.test(normalized);
}

module.exports = {
    downloadAndConvertToWebm,
    extractTenorId,
    getTenorGifUrl,
    isTenorUrl
};
