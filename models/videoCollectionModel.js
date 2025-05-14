const db = require('../database/db');

// Save a video to the videos table
const saveVideo = (video, callback) => {
    const {
        originalHref,
        fullUrl,
        pageUrl,
        pageName,
        pageSlug,
        videoUrl,
        durationMs,
        sdUrl,
        hdUrl,
        title,
        thumbnail,
        downloadedFile,
        targetSpanText
    } = video;

    const stmt = db.prepare(`
        INSERT INTO videos (
            originalHref, fullUrl, pageUrl, pageName, pageSlug, videoUrl,
            durationMs, sdUrl, hdUrl, title, thumbnail, downloadedFile, targetSpanText
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        originalHref, fullUrl, pageUrl, pageName, pageSlug, videoUrl,
        durationMs, sdUrl, hdUrl, title, thumbnail, downloadedFile, targetSpanText,
        (err) => {
            if (err) {
                console.error('Error inserting video:', err);
                return callback(err);
            }
            callback(null, this.lastID);
        }
    );

    stmt.finalize();
};

// Retrieve all videos from the videos table
const getAllVideos = (callback) => {
    db.all('SELECT * FROM videos', [], (err, rows) => {
        if (err) {
            console.error('Error retrieving videos:', err);
            return callback(err);
        }
        callback(null, rows);
    });
};

// Check if a page exists by slug
const getPageBySlug = (slug, callback) => {
    console.log('Checking for page with slug:', slug);
    db.get('SELECT id FROM extract_page_info WHERE slug = ?', [slug], (err, row) => {
        if (err) {
            console.error('Error checking page by slug:', err);
            return callback(err);
        }
        console.log('Page check result for slug', slug, ':', row);
        callback(null, row ? row.id : null);
    });
};

// Save page info to extract_page_info table
const savePageInfo = (pageInfo, callback) => {
    const { pageName, slug, url, followersText, likesText, imageUrl } = pageInfo;
    console.log('Preparing to save page info:', pageInfo);

    getPageBySlug(slug, (err, existingPageId) => {
        if (err) {
            console.error('Error checking existing page:', err);
            return callback(err);
        }

        if (existingPageId) {
            console.log('Page with slug', slug, 'already exists with id:', existingPageId);
            return callback(null, existingPageId);
        }

        const stmt = db.prepare(`
            INSERT INTO extract_page_info (pageName, slug, url, followersText, likesText, imageUrl)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(pageName, slug, url, followersText, likesText, imageUrl, function (err) {
            if (err) {
                console.error('Error inserting page info:', err);
                return callback(err);
            }
            console.log('Inserted page info, lastID:', this.lastID);
            callback(null, this.lastID);
        });

        stmt.finalize();
    });
};

// Save JSON file path to page_json_files table and return the inserted id
const saveJsonFile = (pageId, jsonFile, callback) => {
    console.log('Saving JSON file for pageId:', pageId, 'jsonFile:', jsonFile);
    if (!pageId) {
        console.error('No pageId provided for saving JSON file');
        return callback(new Error('pageId is undefined'));
    }
    const stmt = db.prepare(`
        INSERT INTO page_json_files (page_id, jsonFile)
        VALUES (?, ?)
    `);

    stmt.run(pageId, jsonFile, function (err) {
        if (err) {
            console.error('Error inserting JSON file:', err);
            return callback(err);
        }
        console.log('Inserted JSON file for pageId:', pageId, 'jsonFileId:', this.lastID);
        callback(null, this.lastID);
    });

    stmt.finalize();
};

// Check if a reel exists by reelUrl
const checkReelExists = (reelUrl, callback) => {
    console.log('Checking if reel exists with reelUrl:', reelUrl);
    db.get('SELECT id FROM extract_page_reels WHERE reelUrl = ?', [reelUrl], (err, row) => {
        if (err) {
            console.error('Error checking reel existence:', err);
            return callback(err);
        }
        console.log('Reel check result for reelUrl', reelUrl, ':', row);
        callback(null, row ? row.id : null);
    });
};

// Save reels to extract_page_reels table with json_file_id
const saveReels = (pageId, jsonFileId, reels, callback) => {
    console.log('Attempting to save reels with pageId:', pageId, 'jsonFileId:', jsonFileId, 'Reels:', reels);
    if (!pageId) {
        console.error('No pageId provided for saving reels');
        return callback(new Error('pageId is undefined'));
    }
    if (!jsonFileId) {
        console.error('No jsonFileId provided for saving reels');
        return callback(new Error('jsonFileId is undefined'));
    }

    if (!reels || !Array.isArray(reels) || reels.length === 0) {
        console.log('No valid reels to save for pageId:', pageId);
        return callback(null);
    }

    const stmt = db.prepare(`
        INSERT INTO extract_page_reels (page_id, json_file_id, href, reelPage, reelPageslug, reelUrl, src, targetSpanText)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let savedCount = 0;
    let processedCount = 0;
    let errors = [];

    reels.forEach(reel => {
        const { href, reelPage, reelPageslug, reelUrl, src, targetSpanText } = reel;
        if (!reelUrl) {
            console.warn('Skipping reel with missing reelUrl:', reel);
            processedCount++;
            if (processedCount === reels.length) {
                stmt.finalize();
                console.log('All reels processed for pageId:', pageId, 'Saved:', savedCount, 'Errors:', errors);
                callback(errors.length > 0 ? new Error(errors.join('; ')) : null);
            }
            return;
        }

        checkReelExists(reelUrl, (err, existingReelId) => {
            if (err) {
                console.error('Error checking reel for reelUrl:', reelUrl, 'Error:', err);
                errors.push(`Error checking reel ${reelUrl}: ${err.message}`);
                processedCount++;
                if (processedCount === reels.length) {
                    stmt.finalize();
                    console.log('All reels processed for pageId:', pageId, 'Saved:', savedCount, 'Errors:', errors);
                    callback(errors.length > 0 ? new Error(errors.join('; ')) : null);
                }
                return;
            }

            if (existingReelId) {
                console.log('Reel with reelUrl', reelUrl, 'already exists with id:', existingReelId);
                processedCount++;
                if (processedCount === reels.length) {
                    stmt.finalize();
                    console.log('All reels processed for pageId:', pageId, 'Saved:', savedCount, 'Errors:', errors);
                    callback(errors.length > 0 ? new Error(errors.join('; ')) : null);
                }
                return;
            }

            console.log('Saving reel:', { page_id: pageId, json_file_id: jsonFileId, href, reelPage, reelPageslug, reelUrl, src, targetSpanText });
            stmt.run(pageId, jsonFileId, href || '', reelPage || '', reelPageslug || '', reelUrl, src || null, targetSpanText || null, (err) => {
                if (err) {
                    console.error('Error inserting reel for reelUrl:', reelUrl, 'Error:', err);
                    errors.push(`Error inserting reel ${reelUrl}: ${err.message}`);
                } else {
                    savedCount++;
                    console.log('Successfully saved reel, savedCount:', savedCount);
                }
                processedCount++;
                if (processedCount === reels.length) {
                    stmt.finalize();
                    console.log('All reels processed for pageId:', pageId, 'Saved:', savedCount, 'Errors:', errors);
                    callback(errors.length > 0 ? new Error(errors.join('; ')) : null);
                }
            });
        });
    });
};

// Retrieve all page info with associated JSON files
const getAllPageInfo = (callback) => {
    db.all(`
        SELECT p.*, GROUP_CONCAT(j.jsonFile) as jsonFiles
        FROM extract_page_info p
        LEFT JOIN page_json_files j ON p.id = j.page_id
        GROUP BY p.id
    `, [], (err, rows) => {
        if (err) {
            console.error('Error retrieving page info:', err);
            return callback(err);
        }
        rows.forEach(row => {
            row.jsonFiles = row.jsonFiles ? row.jsonFiles.split(',') : [];
        });
        console.log('Retrieved page info with JSON files:', rows);
        callback(null, rows);
    });
};

// Retrieve reels for a specific page with JSON file paths
const getReelsByPageId = (pageId, callback) => {
    console.log('Retrieving reels for pageId:', pageId);
    db.all(`
        SELECT r.*, j.jsonFile
        FROM extract_page_reels r
        LEFT JOIN page_json_files j ON r.json_file_id = j.id
        WHERE r.page_id = ?
    `, [pageId], (err, rows) => {
        if (err) {
            console.error('Error retrieving reels:', err);
            return callback(err);
        }
        console.log('Retrieved reels for pageId:', pageId, 'Rows:', rows);
        callback(null, rows);
    });
};

// Update extract_page_info with download info
const updatePageDownloadInfo = (pageId, downloadLocation, callback) => {
    const timestamp = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE extract_page_info
        SET download_location = ?, is_download = ?
        WHERE id = ?
    `);
    stmt.run(downloadLocation, timestamp, pageId, (err) => {
        if (err) {
            console.error('Error updating page download info:', err);
            return callback(err);
        }
        callback(null);
    });
    stmt.finalize();
};

// Update extract_page_reels with download path
const updateReelDownloadPath = (reelId, downloadPath, callback) => {
    const stmt = db.prepare(`
        UPDATE extract_page_reels
        SET is_download = ?
        WHERE id = ?
    `);
    stmt.run(downloadPath, reelId, (err) => {
        if (err) {
            console.error('Error updating reel download path:', err);
            return callback(err);
        }
        callback(null);
    });
    stmt.finalize();
};


// Retrieve page info by ID
const getPageById = (pageId, callback) => {
    console.log('Retrieving page with pageId:', pageId);
    db.get(`
        SELECT id, pageName, followersText, imageUrl
        FROM extract_page_info
        WHERE id = ?
    `, [pageId], (err, row) => {
        if (err) {
            console.error('Error retrieving page by ID:', err);
            return callback(err);
        }
        console.log('Retrieved page for pageId:', pageId, 'Row:', row);
        callback(null, row || null);
    });
};

// Get count of JSON files for a page
const getJsonFileCount = (pageId, callback) => {
    console.log('Counting JSON files for pageId:', pageId);
    db.get(`
        SELECT COUNT(*) as count
        FROM page_json_files
        WHERE page_id = ?
    `, [pageId], (err, row) => {
        if (err) {
            console.error('Error counting JSON files:', err);
            return callback(err);
        }
        console.log('JSON file count for pageId:', pageId, 'Count:', row.count);
        callback(null, row.count);
    });
};

// Get count of downloaded videos for a page
const getDownloadedVideoCount = (pageId, callback) => {
    console.log('Counting downloaded videos for pageId:', pageId);
    db.get(`
        SELECT COUNT(*) as count
        FROM videos
        WHERE pageUrl IN (
            SELECT url FROM extract_page_info WHERE id = ?
        )
        AND downloadedFile IS NOT NULL
    `, [pageId], (err, row) => {
        if (err) {
            console.error('Error counting downloaded videos:', err);
            return callback(err);
        }
        console.log('Downloaded video count for pageId:', pageId, 'Count:', row.count);
        callback(null, row.count);
    });
};


module.exports = {
    saveVideo,
    getAllVideos,
    savePageInfo,
    saveJsonFile,
    saveReels,
    getAllPageInfo,
    getReelsByPageId,
    getPageBySlug,
    checkReelExists,
    updatePageDownloadInfo,
    updateReelDownloadPath,
    getDownloadedVideoCount,
    getJsonFileCount,
    getPageById
};