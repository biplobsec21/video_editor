const axios = require('axios');
const Video = require('../models/videoCollectionModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const https = require('https');
const getFbVideoInfo = require('../utils/fbVideoInfo');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed'), false);
        }
    }
});

// Define directories
const imagesDir = path.join(__dirname, '../public/images');
const downloadsDir = path.join(__dirname, '../public/downloads');

// Ensure images directory exists
fsPromises.mkdir(imagesDir, { recursive: true }).catch(err => console.error('Error creating images directory:', err));

// Ensure downloads directory exists
fsPromises.mkdir(downloadsDir, { recursive: true }).catch(err => console.error('Error creating downloads directory:', err));

// Download and save image to local storage
const downloadImage = async (url, prefix = '') => {
    if (!url) return null;
    try {
        console.log(`Downloading image from ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const extension = path.extname(new URL(url).pathname) || '.jpg';
        const filename = `${prefix}${crypto.randomBytes(8).toString('hex')}${extension}`;
        const filePath = path.join(imagesDir, filename);
        await fsPromises.writeFile(filePath, response.data);
        const relativePath = `images/${filename}`;
        console.log(`Saved image to ${relativePath}`);
        return relativePath;
    } catch (err) {
        console.error(`Error downloading image from ${url}:`, err.message);
        return null;
    }
};

// Helper function to download video
const downloadVideo = (url, outputFilePath) => {
    return new Promise((resolve, reject) => {
        console.log('fs.createWriteStream type:', typeof fs.createWriteStream);
        const file = fs.createWriteStream(outputFilePath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Download failed with status ${response.statusCode}`));
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve());
            });
        }).on('error', (err) => {
            fsPromises.unlink(outputFilePath).catch(() => { });
            reject(err);
        });
    });
};

// List all page info
exports.lists = (req, res) => {
    Video.getAllPageInfo((err, pages) => {
        if (err) {
            console.error('Error fetching page info:', err);
            return res.render('pages/video_collection/index', {
                pages: [],
                uploadMessage: 'Error fetching page info',
                uploadSuccess: false
            });
        }
        console.log('Fetched pages with JSON files:', pages);
        res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: null,
            uploadSuccess: false
        });
    });
};

// Process uploaded JSON file
exports.uploadJson = [upload.single('jsonFile'), async (req, res) => {
    if (!req.file) {
        console.error('No file uploaded');
        const pages = await new Promise((resolve, reject) => {
            Video.getAllPageInfo((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });
        return res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: 'No file uploaded',
            uploadSuccess: false
        });
    }

    console.log('File uploaded:', req.file);

    try {
        const jsonData = JSON.parse(await fsPromises.readFile(req.file.path, 'utf8'));
        console.log('Parsed JSON:', jsonData);

        if (!jsonData.fbPageInfo && !jsonData.reels) {
            throw new Error('JSON must contain either fbPageInfo or reels');
        }

        const pageImageUrl = jsonData.fbPageInfo?.imageUrl;
        const localPageImage = await downloadImage(pageImageUrl, 'page_');

        const pageInfo = {
            pageName: jsonData.fbPageInfo ? (jsonData.fbPageInfo.pageName || 'Unknown').trim().replace(/\u00A0/g, ' ') : 'Unknown Page',
            slug: jsonData.fbPageInfo ? jsonData.fbPageInfo.slug || '' : 'unknown',
            url: jsonData.fbPageInfo ? jsonData.fbPageInfo.url || '' : '',
            followersText: jsonData.fbPageInfo ? jsonData.fbPageInfo.followersText || null : null,
            likesText: jsonData.fbPageInfo ? jsonData.fbPageInfo.likesText || null : null,
            imageUrl: localPageImage || null
        };

        console.log('Saving page info:', pageInfo);

        const pageId = await new Promise((resolve, reject) => {
            Video.savePageInfo(pageInfo, (err, pageId) => {
                if (err) reject(err);
                resolve(pageId);
            });
        });

        if (!pageId) {
            console.error('pageId is undefined after saving page info');
            await fsPromises.unlink(req.file.path).catch(() => { });
            const pages = await new Promise((resolve, reject) => {
                Video.getAllPageInfo((err, pages) => {
                    if (err) reject(err);
                    resolve(pages);
                });
            });
            return res.render('pages/video_collection/index', {
                pages: pages || [],
                uploadMessage: 'Failed to obtain pageId',
                uploadSuccess: false
            });
        }

        const jsonFilePath = req.file.path.replace('public/', '');
        console.log('Attempting to save JSON file path:', jsonFilePath, 'for pageId:', pageId);
        const jsonFileId = await new Promise((resolve, reject) => {
            Video.saveJsonFile(pageId, jsonFilePath, (err, jsonFileId) => {
                if (err) reject(err);
                resolve(jsonFileId);
            });
        });

        console.log('Saved JSON file path:', jsonFilePath, 'jsonFileId:', jsonFileId);

        if (jsonData.reels && Array.isArray(jsonData.reels)) {
            const reelsWithLocalImages = [];
            for (const reel of jsonData.reels) {
                const localReelImage = await downloadImage(reel.src, 'reel_');
                reelsWithLocalImages.push({
                    ...reel,
                    src: localReelImage || reel.src || null
                });
            }

            console.log('Saving reels for pageId:', pageId, 'jsonFileId:', jsonFileId, 'Reels:', reelsWithLocalImages);
            await new Promise((resolve, reject) => {
                Video.saveReels(pageId, jsonFileId, reelsWithLocalImages, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
        }

        console.log('Successfully processed JSON for pageId:', pageId);
        const pages = await new Promise((resolve, reject) => {
            Video.getAllPageInfo((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });
        res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: 'File uploaded and processed successfully',
            uploadSuccess: true
        });

    } catch (err) {
        console.error('Error processing JSON:', err.message);
        await fsPromises.unlink(req.file.path).catch(() => { });
        const pages = await new Promise((resolve, reject) => {
            Video.getAllPageInfo((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });
        res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: `Error processing JSON file: ${err.message}`,
            uploadSuccess: false
        });
    }
}];

// Get reels for a specific page
exports.getReels = (req, res) => {
    const { pageId } = req.params;
    console.log('Fetching reels for pageId:', pageId);
    Video.getReelsByPageId(pageId, (err, reels) => {
        if (err) {
            console.error('Error fetching reels:', err);
            return res.status(500).json({ error: 'Error fetching reels' });
        }
        console.log('Fetched reels:', reels);
        res.json(reels);
    });
};

// Download reels for a specific page
exports.downloadReels = async (req, res) => {
    const { pageId } = req.params;
    const { subdirectory } = req.body;

    try {
        // Validate pageId
        if (!/^\d+$/.test(pageId)) {
            const pages = await new Promise((resolve, reject) => {
                Video.getAllPageInfo((err, pages) => {
                    if (err) reject(err);
                    resolve(pages);
                });
            });
            return res.render('pages/video_collection/index', {
                pages: pages || [],
                uploadMessage: 'Invalid pageId',
                uploadSuccess: false
            });
        }

        // Create download directory
        const safeSubdirectory = subdirectory ? subdirectory.replace(/[^a-zA-Z0-9-_]/g, '') : 'default';
        const downloadDir = path.join(downloadsDir, safeSubdirectory);
        await fsPromises.mkdir(downloadDir, { recursive: true });

        // Fetch reels
        const reels = await new Promise((resolve, reject) => {
            Video.getReelsByPageId(pageId, (err, reels) => {
                if (err) reject(err);
                resolve(reels);
            });
        });

        if (!reels || reels.length === 0) {
            const pages = await new Promise((resolve, reject) => {
                Video.getAllPageInfo((err, pages) => {
                    if (err) reject(err);
                    resolve(pages);
                });
            });
            return res.render('pages/video_collection/index', {
                pages: pages || [],
                uploadMessage: 'No reels found for this page',
                uploadSuccess: false
            });
        }

        const results = [];

        // Process reels sequentially
        for (const reel of reels) {
            const reelUrl = `https://www.facebook.com${reel.href}`;
            const match = reel.href.match(/\/reel\/(\d+)/);
            const reelId = match ? match[1] : `unknown_${Date.now()}`;

            try {
                // Check if reel is already downloaded
                if (reel.is_download) {
                    try {
                        await fsPromises.access(reel.is_download);
                        console.log(`ℹ️ Skipping download for reel ${reelId}: Already downloaded at ${reel.is_download}`);
                        results.push({
                            reelId,
                            status: 'skipped',
                            downloadedFile: reel.is_download.split('/').pop()
                        });
                        continue;
                    } catch (error) {
                        console.log(`⚠️ File not found at ${reel.is_download}. Proceeding to download reel ${reelId}.`);
                    }
                }

                if (typeof getFbVideoInfo !== 'function') {
                    throw new Error('getFbVideoInfo is not a function');
                }

                const videoInfo = await getFbVideoInfo(reelUrl);
                const safeFilename = `[${reelId}].mp4`;
                const downloadPath = path.join(downloadDir, safeFilename);

                if (videoInfo?.hd) {
                    console.log(`⬇️ Downloading video from: ${videoInfo.hd}`);
                    await downloadVideo(videoInfo.hd, downloadPath);
                    console.log(`✅ Download complete: ${safeFilename}`);

                    // Update videos table
                    const videoData = {
                        originalHref: reel.href,
                        fullUrl: reelUrl,
                        pageUrl: reel.reelUrl,
                        pageName: reel.reelPage,
                        pageSlug: reel.reelPageslug,
                        videoUrl: videoInfo.hd,
                        durationMs: null,
                        sdUrl: videoInfo.sd || null,
                        hdUrl: videoInfo.hd,
                        title: null,
                        thumbnail: reel.src || null,
                        downloadedFile: downloadPath,
                        targetSpanText: reel.targetSpanText || null
                    };

                    const videoId = await new Promise((resolve, reject) => {
                        Video.saveVideo(videoData, (err, id) => {
                            if (err) reject(err);
                            resolve(id);
                        });
                    });

                    // Update extract_page_info
                    await new Promise((resolve, reject) => {
                        Video.updatePageDownloadInfo(pageId, downloadDir, (err) => {
                            if (err) reject(err);
                            resolve();
                        });
                    });

                    // Update extract_page_reels
                    await new Promise((resolve, reject) => {
                        Video.updateReelDownloadPath(reel.id, downloadPath, (err) => {
                            if (err) reject(err);
                            resolve();
                        });
                    });

                    results.push({
                        reelId,
                        status: 'success',
                        downloadedFile: safeFilename
                    });
                } else {
                    console.warn(`⚠️ No HD video found for ${reelUrl}`);
                    results.push({
                        reelId,
                        status: 'failed',
                        error: 'No HD video found'
                    });
                }
            } catch (error) {
                console.error(`❌ Failed for ${reelUrl}:`, error.message);
                results.push({
                    reelId,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        const pages = await new Promise((resolve, reject) => {
            Video.getAllPageInfo((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });

        const downloadedCount = results.filter(r => r.status === 'success').length;
        const skippedCount = results.filter(r => r.status === 'skipped').length;
        const failedCount = results.filter(r => r.status === 'failed').length;

        res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: `Processed ${results.length} reels. Successfully downloaded ${downloadedCount}, skipped ${skippedCount} (already downloaded), failed ${failedCount} to downloads/${safeSubdirectory}`,
            uploadSuccess: downloadedCount > 0 || skippedCount > 0
        });

    } catch (err) {
        console.error('Error downloading reels:', err);
        const pages = await new Promise((resolve, reject) => {
            Video.getAllPageInfo((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });
        res.render('pages/video_collection/index', {
            pages: pages || [],
            uploadMessage: `Error downloading reels: ${err.message}`,
            uploadSuccess: false
        });
    }
};

// Get details for a specific page
exports.getPageDetails = async (req, res) => {
    const { pageId } = req.params;

    try {
        // Validate pageId
        if (!/^\d+$/.test(pageId)) {
            return res.render('pages/video_collection/page_details', {
                page: null,
                jsonFileCount: 0,
                downloadedVideoCount: 0,
                reels: [],
                error: 'Invalid pageId'
            });
        }

        // Fetch page info
        const page = await new Promise((resolve, reject) => {
            Video.getPageById(pageId, (err, page) => {
                if (err) reject(err);
                resolve(page);
            });
        });

        if (!page) {
            return res.render('pages/video_collection/page_details', {
                page: null,
                jsonFileCount: 0,
                downloadedVideoCount: 0,
                reels: [],
                error: 'Page not found'
            });
        }

        // Fetch JSON file count
        const jsonFileCount = await new Promise((resolve, reject) => {
            Video.getJsonFileCount(pageId, (err, count) => {
                if (err) reject(err);
                resolve(count);
            });
        });

        // Fetch downloaded video count
        const downloadedVideoCount = await new Promise((resolve, reject) => {
            Video.getDownloadedVideoCount(pageId, (err, count) => {
                if (err) reject(err);
                resolve(count);
            });
        });

        // Fetch reels and check file existence
        const reels = await new Promise((resolve, reject) => {
            Video.getReelsByPageId(pageId, (err, reels) => {
                if (err) reject(err);
                resolve(reels);
            });
        });

        // Check file existence for each reel and convert is_download to relative path
        const publicDir = path.join(__dirname, '../public');
        const reelsWithStatus = await Promise.all(reels.map(async (reel) => {
            let fileExists = false;
            let relativePath = null;
            if (reel.is_download) {
                try {
                    await fsPromises.access(reel.is_download);
                    fileExists = true;
                    relativePath = reel.is_download.replace(publicDir, '').replace(/\\/g, '/');
                    if (!relativePath.startsWith('/')) {
                        relativePath = `/${relativePath}`;
                    }
                } catch (error) {
                    console.log(`⚠️ File not found at ${reel.is_download} for reel ${reel.id}`);
                }
            }
            return {
                ...reel,
                fileExists,
                link: fileExists ? relativePath : `https://www.facebook.com${reel.href}`
            };
        }));

        res.render('pages/video_collection/page_details', {
            page,
            jsonFileCount,
            downloadedVideoCount,
            reels: reelsWithStatus,
            error: null
        });

    } catch (err) {
        console.error('Error fetching page details:', err);
        res.render('pages/video_collection/page_details', {
            page: null,
            jsonFileCount: 0,
            downloadedVideoCount: 0,
            reels: [],
            error: `Error fetching page details: ${err.message}`
        });
    }
};

module.exports = exports;