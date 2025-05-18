const db = require('../database/db');

class TempVideoModel {
    static async create(videoData) {
        return new Promise((resolve, reject) => {
            const { filename, originalName, filePath, fileSize, duration, resolutionWidth, resolutionHeight } = videoData;

            const sql = `
                INSERT INTO temp_videos (
                    filename, original_name, file_path, file_size, 
                    duration, resolution_width, resolution_height
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(sql, [
                filename, originalName, filePath, fileSize,
                duration, resolutionWidth, resolutionHeight
            ], function (err) {
                if (err) {
                    console.error('Error creating video record:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    static async getAll() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM temp_videos 
                ORDER BY created_at DESC
            `;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('Error getting videos:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    static async getById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM temp_videos WHERE id = ?';

            db.get(sql, [id], (err, row) => {
                if (err) {
                    console.error('Error getting video by id:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    static async deleteById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM temp_videos WHERE id = ?';

            db.run(sql, [id], function (err) {
                if (err) {
                    console.error('Error deleting video:', err);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }
}

module.exports = TempVideoModel; 