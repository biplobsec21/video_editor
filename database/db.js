const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create or open the SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to the SQLite database.");
    }
});

// Create tables and modify existing ones
db.serialize(() => {
    // Existing 'pages' table
    db.run(`
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pageid TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            page_image TEXT,
            accessToken TEXT,
            page_url TEXT
        );
    `);

    // Existing 'videos' table
    db.run(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            originalHref TEXT NOT NULL,
            fullUrl TEXT NOT NULL,
            pageUrl TEXT NOT NULL,
            pageName TEXT NOT NULL,
            pageSlug TEXT NOT NULL,
            videoUrl TEXT NOT NULL,
            durationMs INTEGER,
            sdUrl TEXT,
            hdUrl TEXT,
            title TEXT,
            thumbnail TEXT,
            downloadedFile TEXT,
            targetSpanText TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Updated 'extract_page_info' table with new fields
    db.run(`
        CREATE TABLE IF NOT EXISTS extract_page_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pageName TEXT NOT NULL,
            slug TEXT NOT NULL,
            url TEXT NOT NULL,
            followersText TEXT,
            likesText TEXT,
            imageUrl TEXT,
            download_location TEXT DEFAULT NULL,
            is_download TEXT DEFAULT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Updated 'extract_page_reels' table with new field
    db.run(`
        CREATE TABLE IF NOT EXISTS extract_page_reels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            json_file_id INTEGER NOT NULL,
            href TEXT NOT NULL,
            reelPage TEXT NOT NULL,
            reelPageslug TEXT NOT NULL,
            reelUrl TEXT NOT NULL,
            src TEXT,
            targetSpanText TEXT,
            is_download TEXT DEFAULT 'not_download',
            FOREIGN KEY (page_id) REFERENCES extract_page_info(id) ON DELETE CASCADE,
            FOREIGN KEY (json_file_id) REFERENCES page_json_files(id) ON DELETE CASCADE
        );
    `);

    // Existing 'page_json_files' table
    db.run(`
        CREATE TABLE IF NOT EXISTS page_json_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            jsonFile TEXT NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (page_id) REFERENCES extract_page_info(id) ON DELETE CASCADE
        );
    `);

    // Add new columns to existing tables if they don't exist
    db.run(`ALTER TABLE extract_page_info ADD COLUMN download_location TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding download_location to extract_page_info:', err);
        }
    });
    db.run(`ALTER TABLE extract_page_info ADD COLUMN is_download TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding is_download to extract_page_info:', err);
        }
    });
    db.run(`ALTER TABLE extract_page_reels ADD COLUMN is_download TEXT DEFAULT 'not_download'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding is_download to extract_page_reels:', err);
        }
    });

    // Create temp_videos table
    db.run(`
        CREATE TABLE IF NOT EXISTS temp_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            duration REAL,
            resolution_width INTEGER,
            resolution_height INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `, (err) => {
        if (err) {
            console.error('Error creating temp_videos table:', err);
        } else {
            console.log('temp_videos table created or already exists');
        }
    });

    // Create temp_audio table
    db.run(`
        CREATE TABLE IF NOT EXISTS temp_audio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            duration REAL,
            bitrate INTEGER,
            sample_rate INTEGER,
            channels INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `, (err) => {
        if (err) {
            console.error('Error creating temp_audio table:', err);
        } else {
            console.log('temp_audio table created or already exists');
        }
    });
});

// Create edited_videos table
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS edited_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id INTEGER NOT NULL,
            page_id INTEGER NOT NULL,
            edited_file TEXT NOT NULL,
            thumbnail TEXT,
            edit_params TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (video_id) REFERENCES videos(id),
            FOREIGN KEY (page_id) REFERENCES extract_page_info(id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating edited_videos table:', err);
        } else {
            console.log('edited_videos table created or already exists');

            // Add thumbnail column if it doesn't exist
            db.all("PRAGMA table_info(edited_videos)", [], (err, rows) => {
                if (err) {
                    console.error('Error checking table info:', err);
                    return;
                }

                const hasThumbColumn = rows.some(row => row.name === 'thumbnail');
                if (!hasThumbColumn) {
                    db.run(`ALTER TABLE edited_videos ADD COLUMN thumbnail TEXT`, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            console.error('Error adding thumbnail column:', err);
                        } else {
                            console.log('Thumbnail column added to edited_videos table');
                        }
                    });
                }
            });
        }
    });
});
module.exports = db;