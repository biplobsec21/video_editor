const db = require('../database/db');
const path = require('path');
const fs = require('fs').promises;

class ContentCollection {
    static async create(content) {
        const query = `
            INSERT INTO content_collection (
                title, 
                description, 
                tags, 
                category,
                thumbnail_path,
                video_path,
                duration,
                resolution,
                hashtags,
                trim_data,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        try {
            const [result] = await db.execute(query, [
                content.title,
                content.description,
                JSON.stringify(content.tags),
                content.category,
                content.thumbnailPath,
                content.videoPath,
                content.duration,
                JSON.stringify(content.resolution),
                JSON.stringify(content.hashtags),
                JSON.stringify(content.trimData)
            ]);
            return result.insertId;
        } catch (error) {
            console.error('Error creating content:', error);
            throw error;
        }
    }

    static async update(id, content) {
        const query = `
            UPDATE content_collection 
            SET 
                title = ?,
                description = ?,
                tags = ?,
                category = ?,
                thumbnail_path = ?,
                video_path = ?,
                duration = ?,
                resolution = ?,
                hashtags = ?,
                trim_data = ?,
                updated_at = NOW()
            WHERE id = ?
        `;

        try {
            const [result] = await db.execute(query, [
                content.title,
                content.description,
                JSON.stringify(content.tags),
                content.category,
                content.thumbnailPath,
                content.videoPath,
                content.duration,
                JSON.stringify(content.resolution),
                JSON.stringify(content.hashtags),
                JSON.stringify(content.trimData),
                id
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating content:', error);
            throw error;
        }
    }

    static async getAll() {
        const query = 'SELECT * FROM content_collection ORDER BY created_at DESC';
        try {
            const [rows] = await db.execute(query);
            return rows.map(row => ({
                ...row,
                tags: JSON.parse(row.tags || '[]'),
                resolution: JSON.parse(row.resolution || '{}'),
                hashtags: JSON.parse(row.hashtags || '[]'),
                trim_data: JSON.parse(row.trim_data || '[]')
            }));
        } catch (error) {
            console.error('Error fetching content:', error);
            throw error;
        }
    }

    static async getById(id) {
        const query = 'SELECT * FROM content_collection WHERE id = ?';
        try {
            const [rows] = await db.execute(query, [id]);
            if (rows.length === 0) return null;

            const content = rows[0];
            return {
                ...content,
                tags: JSON.parse(content.tags || '[]'),
                resolution: JSON.parse(content.resolution || '{}'),
                hashtags: JSON.parse(content.hashtags || '[]'),
                trim_data: JSON.parse(content.trim_data || '[]')
            };
        } catch (error) {
            console.error('Error fetching content by id:', error);
            throw error;
        }
    }

    static async delete(id) {
        // First get the content to delete associated files
        const content = await this.getById(id);
        if (!content) return false;

        // Delete associated files
        try {
            if (content.thumbnail_path) {
                await fs.unlink(path.join(__dirname, '../public', content.thumbnail_path));
            }
            if (content.video_path) {
                await fs.unlink(path.join(__dirname, '../public', content.video_path));
            }
        } catch (error) {
            console.error('Error deleting files:', error);
        }

        // Delete from database
        const query = 'DELETE FROM content_collection WHERE id = ?';
        try {
            const [result] = await db.execute(query, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting content:', error);
            throw error;
        }
    }

    static async search(searchTerm) {
        const query = `
            SELECT * FROM content_collection 
            WHERE 
                title LIKE ? OR 
                description LIKE ? OR 
                tags LIKE ? OR 
                hashtags LIKE ?
            ORDER BY created_at DESC
        `;
        const searchPattern = `%${searchTerm}%`;

        try {
            const [rows] = await db.execute(query, [
                searchPattern,
                searchPattern,
                searchPattern,
                searchPattern
            ]);
            return rows.map(row => ({
                ...row,
                tags: JSON.parse(row.tags || '[]'),
                resolution: JSON.parse(row.resolution || '{}'),
                hashtags: JSON.parse(row.hashtags || '[]'),
                trim_data: JSON.parse(row.trim_data || '[]')
            }));
        } catch (error) {
            console.error('Error searching content:', error);
            throw error;
        }
    }
} 