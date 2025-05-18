const db = require('../database/db');

class TempAudioModel {
    static async create(audioData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO temp_audio (
                    filename, original_name, file_path, file_size, 
                    duration, bitrate, sample_rate, channels
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(sql, [
                audioData.filename,
                audioData.originalName,
                audioData.filePath,
                audioData.fileSize,
                audioData.duration,
                audioData.bitrate,
                audioData.sampleRate,
                audioData.channels
            ], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    static async getAll() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM temp_audio ORDER BY created_at DESC';
            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    static async getById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM temp_audio WHERE id = ?';
            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    static async deleteById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM temp_audio WHERE id = ?';
            db.run(sql, [id], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }
}

module.exports = TempAudioModel; 