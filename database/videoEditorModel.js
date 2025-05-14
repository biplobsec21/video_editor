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
const saveEditedVideo = (videoId, pageId, editedFile, editParams, callback) => {
    const stmt = db.prepare(`
        INSERT INTO edited_videos (video_id, page_id, edited_file, edit_params)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(videoId, pageId, editedFile, JSON.stringify(editParams), (err) => {
        if (err) {
            console.error('Error saving edited video:', err);
            return callback(err);
        }
        callback(null, this.lastID);
    });
    stmt.finalize();
};

// Get edited videos by page_id
const getEditedVideosByPageId = (pageId, callback) => {
    db.all(`
        SELECT ev.*, v.downloadedFile AS originalFile
        FROM edited_videos ev
        JOIN videos v ON ev.video_id = v.id
        WHERE ev.page_id = ?
    `, [pageId], (err, rows) => {
        if (err) {
            console.error('Error retrieving edited videos:', err);
            return callback(err);
        }
        callback(null, rows);
    });
};

// Update existing edited video
const updateEditedVideo = (videoId, pageId, editedFile, editParams, callback) => {
    const stmt = db.prepare(`
        UPDATE edited_videos 
        SET edited_file = ?, edit_params = ?
        WHERE video_id = ? AND page_id = ?
    `);
    stmt.run(editedFile, JSON.stringify(editParams), videoId, pageId, (err) => {
        if (err) {
            console.error('Error updating edited video:', err);
            return callback(err);
        }
        callback(null);
    });
    stmt.finalize();
};

module.exports = {
    getAllPages,
    getVideosByPageId,
    saveEditedVideo,
    getEditedVideosByPageId,
    updateEditedVideo
};