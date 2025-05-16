const db = require('../database/db');

// Get all pages from extract_page_info
const getAllPages = (callback) => {
    db.all('SELECT id, pageName FROM extract_page_info', [], (err, rows) => {
        if (err) {
            console.error('Error retrieving pages:', err);
            return callback(err);
        }
        callback(null, rows);
    });
};

// Get videos by page_id with file existence check
const getVideosByPageId = (pageId, callback) => {
    db.all(`
        SELECT v.*, CASE WHEN v.downloadedFile IS NOT NULL 
            AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' 
            AND name='edited_videos') THEN 1 ELSE 0 END AS fileExists
        FROM videos v
        WHERE v.pageUrl IN (SELECT url FROM extract_page_info WHERE id = ?)
        AND v.downloadedFile IS NOT NULL
    `, [pageId], (err, rows) => {
        if (err) {
            console.error('Error retrieving videos:', err);
            return callback(err);
        }
        // Verify file existence on disk
        const fs = require('fs').promises;
        Promise.all(rows.map(async (video) => {
            try {
                await fs.access(video.downloadedFile.replace(/^public\//, 'public/'));
                video.fileExists = true;
            } catch {
                video.fileExists = false;
            }
            return video;
        })).then((videos) => {
            callback(null, videos.filter(v => v.fileExists));
        }).catch((err) => {
            console.error('Error checking video files:', err);
            callback(err);
        });
    });
};

// Save edited video
const saveEditedVideo = (videoId, pageId, editedFile, thumbnail, editParams, callback) => {
    // Always insert a new record for each edit
    const stmt = db.prepare(`
        INSERT INTO edited_videos (video_id, page_id, edited_file, thumbnail, edit_params, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(videoId, pageId, editedFile, thumbnail, JSON.stringify(editParams), function (err) {
        if (err) {
            console.error('Error saving edited video:', err);
            return callback(err);
        }
        callback(null, this.lastID); // Return the ID of the newly inserted record
    });
    stmt.finalize();
};

// Get edited videos by page_id
const getEditedVideosByPageId = (pageId, videoId = null, callback) => {
    // Handle case where videoId is the callback (backwards compatibility)
    if (typeof videoId === 'function') {
        callback = videoId;
        videoId = null;
    }

    // Ensure callback is a function
    if (typeof callback !== 'function') {
        console.error('Callback not provided to getEditedVideosByPageId');
        return;
    }

    let query = `
        SELECT ev.*, v.downloadedFile AS originalFile, v.title,
               datetime(ev.created_at) as created_at
        FROM edited_videos ev
        JOIN videos v ON ev.video_id = v.id
        WHERE ev.page_id = ?
        ${videoId ? 'AND ev.video_id = ?' : ''}
        ORDER BY ev.created_at DESC
    `;
    let params = videoId ? [pageId, videoId] : [pageId];

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error retrieving edited videos:', err);
            return callback(err);
        }

        // Parse edit_params JSON for each row
        const processedRows = rows.map(row => {
            try {
                if (row.edit_params) {
                    row.edit_params = JSON.parse(row.edit_params);
                } else {
                    row.edit_params = {
                        trim: null,
                        crop: null,
                        textOverlays: []
                    };
                }
            } catch (parseErr) {
                console.error('Error parsing edit_params:', parseErr);
                row.edit_params = {
                    trim: null,
                    crop: null,
                    textOverlays: []
                };
            }
            return row;
        });

        callback(null, processedRows);
    });
};

module.exports = {
    getAllPages,
    getVideosByPageId,
    saveEditedVideo,
    getEditedVideosByPageId
};