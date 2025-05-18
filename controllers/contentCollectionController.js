const ContentCollection = require('../models/contentCollectionModel');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const ffprobe = promisify(ffmpeg.ffprobe);

// Helper function to get video metadata
async function getVideoMetadata(videoPath) {
    try {
        const metadata = await ffprobe(videoPath);
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        return {
            duration: metadata.format.duration,
            resolution: {
                width: videoStream.width,
                height: videoStream.height
            },
            format: metadata.format.format_name,
            size: metadata.format.size
        };
    } catch (error) {
        console.error('Error getting video metadata:', error);
        throw error;
    }
}

// Helper function to handle file upload
async function handleFileUpload(file, type) {
    const uploadDir = path.join(__dirname, '../public/uploads', type);
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(uploadDir, filename);

    await fs.writeFile(filepath, file.data);
    return `/uploads/${type}/${filename}`;
}

exports.renderContentCollection = async (req, res) => {
    try {
        const contents = await ContentCollection.getAll();
        res.render('pages/content_collection/index', {
            contents,
            title: 'Content Collection',
            path: req.path,
            error: null
        });
    } catch (error) {
        console.error('Error rendering content collection:', error);
        res.render('pages/content_collection/index', {
            contents: [],
            title: 'Content Collection',
            path: req.path,
            error: 'Failed to load content collection'
        });
    }
};

exports.renderCreateForm = (req, res) => {
    res.render('pages/content_collection/create', {
        title: 'Create New Content',
        path: req.path,
        error: null
    });
};

exports.renderEditForm = async (req, res) => {
    try {
        const content = await ContentCollection.getById(req.params.id);
        if (!content) {
            return res.status(404).send('Content not found');
        }
        res.render('pages/content_collection/edit', {
            content,
            title: 'Edit Content',
            path: req.path,
            error: null
        });
    } catch (error) {
        console.error('Error rendering edit form:', error);
        res.status(500).send('Error loading content');
    }
};

exports.createContent = async (req, res) => {
    try {
        const { title, description, tags, category, hashtags, trimData } = req.body;

        // Handle video upload
        if (!req.files || !req.files.video) {
            throw new Error('No video file uploaded');
        }
        const videoPath = await handleFileUpload(req.files.video, 'videos');

        // Handle thumbnail upload
        let thumbnailPath = null;
        if (req.files && req.files.thumbnail) {
            thumbnailPath = await handleFileUpload(req.files.thumbnail, 'thumbnails');
        }

        // Get video metadata
        const metadata = await getVideoMetadata(path.join(__dirname, '../public', videoPath));

        // Create content
        const content = {
            title,
            description,
            tags: JSON.parse(tags),
            category,
            thumbnailPath,
            videoPath,
            duration: metadata.duration,
            resolution: metadata.resolution,
            hashtags: JSON.parse(hashtags),
            trimData: JSON.parse(trimData)
        };

        await ContentCollection.create(content);
        res.redirect('/content_collection');
    } catch (error) {
        console.error('Error creating content:', error);
        res.render('pages/content_collection/create', {
            title: 'Create New Content',
            error: error.message
        });
    }
};

exports.updateContent = async (req, res) => {
    try {
        const id = req.params.id;
        const { title, description, tags, category, hashtags, trimData } = req.body;

        // Get existing content
        const existingContent = await ContentCollection.getById(id);
        if (!existingContent) {
            return res.status(404).send('Content not found');
        }

        // Handle video upload if new video provided
        let videoPath = existingContent.video_path;
        let metadata = null;
        if (req.files && req.files.video) {
            // Delete old video
            if (existingContent.video_path) {
                await fs.unlink(path.join(__dirname, '../public', existingContent.video_path));
            }
            videoPath = await handleFileUpload(req.files.video, 'videos');
            metadata = await getVideoMetadata(path.join(__dirname, '../public', videoPath));
        }

        // Handle thumbnail upload if new thumbnail provided
        let thumbnailPath = existingContent.thumbnail_path;
        if (req.files && req.files.thumbnail) {
            // Delete old thumbnail
            if (existingContent.thumbnail_path) {
                await fs.unlink(path.join(__dirname, '../public', existingContent.thumbnail_path));
            }
            thumbnailPath = await handleFileUpload(req.files.thumbnail, 'thumbnails');
        }

        // Update content
        const content = {
            title,
            description,
            tags: JSON.parse(tags),
            category,
            thumbnailPath,
            videoPath,
            duration: metadata ? metadata.duration : existingContent.duration,
            resolution: metadata ? metadata.resolution : existingContent.resolution,
            hashtags: JSON.parse(hashtags),
            trimData: JSON.parse(trimData)
        };

        await ContentCollection.update(id, content);
        res.redirect('/content_collection');
    } catch (error) {
        console.error('Error updating content:', error);
        res.render('pages/content_collection/edit', {
            content: req.body,
            title: 'Edit Content',
            error: error.message
        });
    }
};

exports.deleteContent = async (req, res) => {
    try {
        const success = await ContentCollection.delete(req.params.id);
        if (!success) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting content:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.searchContent = async (req, res) => {
    try {
        const { query } = req.query;
        const results = await ContentCollection.search(query);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error searching content:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}; 