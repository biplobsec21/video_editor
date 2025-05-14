const VideoEditor = require('../database/videoEditorModel');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { toRelativePath, toAbsolutePath, normalizePath } = require('../utils/pathUtils');

// Define paths
const publicDir = path.join(__dirname, '../public');
const editedVideosDir = path.join(publicDir, 'edited_videos');

// Create necessary directories with proper permissions
async function ensureDirectoriesExist() {
    try {
        // Create public directory if it doesn't exist
        await fs.mkdir(publicDir, { recursive: true, mode: 0o755 });

        // Create edited_videos directory if it doesn't exist
        await fs.mkdir(editedVideosDir, { recursive: true, mode: 0o755 });

        // Double-check permissions
        await fs.chmod(editedVideosDir, 0o755);

        console.log('Directories created and permissions set');
    } catch (err) {
        console.error('Error creating directories:', err);
        throw new Error('Failed to create or set permissions on necessary directories');
    }
}

// Render editor page
exports.renderEditor = async (req, res) => {
    try {
        const pages = await new Promise((resolve, reject) => {
            VideoEditor.getAllPages((err, pages) => {
                if (err) reject(err);
                resolve(pages);
            });
        });

        const pageId = req.query.pageId || (pages.length > 0 ? pages[0].id : null);
        let videos = [];
        let editedVideos = [];

        if (pageId) {
            videos = await new Promise((resolve, reject) => {
                VideoEditor.getVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            });
            editedVideos = await new Promise((resolve, reject) => {
                VideoEditor.getEditedVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            });
        }

        res.render('pages/video_editor/editor', {
            pages,
            selectedPageId: pageId,
            videos,
            editedVideos,
            selectedVideo: null,
            error: null,
            title: 'Video Editor',
            downloadedFile: '',
            isEdited: false,
            videoId: '',
            pageId: pageId || ''
        });
    } catch (err) {
        console.error('Error rendering editor:', err);
        res.render('pages/video_editor/editor', {
            pages: [],
            selectedPageId: null,
            videos: [],
            editedVideos: [],
            selectedVideo: null,
            error: 'Failed to load editor',
            title: 'Video Editor',
            downloadedFile: '',
            isEdited: false,
            videoId: '',
            pageId: ''
        });
    }
};

// Process video edits
exports.processVideo = async (req, res) => {
    try {
        // Ensure directories exist before processing
        await ensureDirectoriesExist();

        const {
            videoId,
            pageId,
            trimStart,
            trimEnd,
            cropWidth,
            cropHeight,
            cropX,
            cropY,
            textOverlay,
            textX,
            textY,
            textSize,
            textWeight,
            textColor,
            textBgColor,
            textBgOpacity,
            isEdited
        } = req.body;

        // Fetch video based on isEdited
        let video;
        if (isEdited === 'true') {
            const editedVideos = await new Promise((resolve, reject) => {
                VideoEditor.getEditedVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            });
            video = editedVideos.find(v => v.video_id == videoId);
            if (!video) {
                throw new Error('Edited video not found');
            }
        } else {
            const videos = await new Promise((resolve, reject) => {
                VideoEditor.getVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            });
            video = videos.find(v => v.id == videoId);
            if (!video || !video.fileExists) {
                throw new Error('Video not found or file missing');
            }
        }

        // Generate output path
        const outputFileName = `${videoId}_${Date.now()}_edited.mp4`;
        const outputPath = path.join(editedVideosDir, outputFileName);
        const relativePath = path.join('edited_videos', outputFileName).replace(/\\/g, '/');

        // Normalize input path
        let inputPath = isEdited === 'true' ? video.edited_file : video.downloadedFile;
        if (!path.isAbsolute(inputPath)) {
            inputPath = path.join(publicDir, inputPath);
        }
        inputPath = path.normalize(inputPath);

        // Verify input file exists
        await fs.access(inputPath).catch(() => {
            throw new Error(`Input file does not exist: ${inputPath}`);
        });

        console.log('Processing video with paths:', {
            inputPath,
            outputPath,
            relativePath
        });

        // Build FFmpeg command
        const command = ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
            })
            .on('progress', (progress) => {
                console.log('Processing: ' + progress.percent + '% done');
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg error:', err);
                console.error('FFmpeg stdout:', stdout);
                console.error('FFmpeg stderr:', stderr);
            });

        if (trimStart || trimEnd) {
            command.setStartTime(trimStart || 0);
            command.setDuration((trimEnd || video.durationMs / 1000) - (trimStart || 0));
        }

        if (cropWidth && cropHeight) {
            command.videoFilter(`crop=${cropWidth}:${cropHeight}:${cropX || 0}:${cropY || 0}`);
        }

        if (textOverlay) {
            // Convert percentage positions to expressions that calculate pixel positions
            const xPos = textX ? `(w-text_w)*${parseInt(textX) / 100}` : '(w-text_w)/2';
            const yPos = textY ? `(h-text_h)*${parseInt(textY) / 100}` : '(h-text_h)/2';

            // Use provided font size and color, or fallback to defaults
            const fontSize = textSize || 24;
            const fontWeight = textWeight || 400;
            const color = textColor?.replace('#', '0x') || 'white';

            // Handle background color and opacity
            const bgColor = textBgColor?.replace('#', '0x') || '000000';
            const bgOpacity = textBgOpacity ? parseInt(textBgOpacity) / 100 : 0.5;

            // Build the drawtext filter with all options
            const drawTextFilter = [
                // Escape Unicode text for FFmpeg
                `drawtext=text='${textOverlay.replace(/'/g, "'\\\\\\''")}'`,
                `fontcolor=${color}`,
                `fontsize=${fontSize}`,
                `x=${xPos}`,
                `y=${yPos}`,
                // Use a font that supports Bengali characters
                `fontfile=/System/Library/Fonts/Supplemental/Bangla\ MN.ttc`,
                // Add box around text for background
                'box=1',
                `boxcolor=${bgColor}@${bgOpacity}`,
                'boxborderw=5' // Add some padding around the text
            ].join(':');

            console.log('Using drawtext filter:', drawTextFilter);

            command.videoFilter(drawTextFilter);
        }

        // Execute FFmpeg with better error handling
        await new Promise((resolve, reject) => {
            command
                .output(outputPath)
                .on('end', () => {
                    console.log('FFmpeg processing finished');
                    resolve();
                })
                .on('error', (err, stdout, stderr) => {
                    console.error('FFmpeg processing failed:', { error: err, stdout, stderr });
                    reject(new Error(`FFmpeg error: ${err.message}\nStdout: ${stdout}\nStderr: ${stderr}`));
                })
                .run();
        });

        // Verify output file
        const stats = await fs.stat(outputPath);
        if (stats.size === 0) {
            throw new Error('Generated video is empty');
        }

        // Save to database
        const editParams = { trimStart, trimEnd, cropWidth, cropHeight, cropX, cropY, textOverlay };
        await new Promise((resolve, reject) => {
            if (isEdited === 'true') {
                VideoEditor.updateEditedVideo(videoId, pageId, relativePath, editParams, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            } else {
                VideoEditor.saveEditedVideo(videoId, pageId, relativePath, editParams, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            }
        });

        res.json({ success: true, editedFile: relativePath });
    } catch (err) {
        console.error('Error processing video:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get videos by page ID (API)
exports.getVideosByPageId = async (req, res) => {
    const { pageId } = req.params;
    try {
        const videos = await new Promise((resolve, reject) => {
            VideoEditor.getVideosByPageId(pageId, (err, videos) => {
                if (err) reject(err);
                resolve(videos);
            });
        });
        const editedVideos = await new Promise((resolve, reject) => {
            VideoEditor.getEditedVideosByPageId(pageId, (err, videos) => {
                if (err) reject(err);
                resolve(videos);
            });
        });
        res.json({ success: true, videos, editedVideos });
    } catch (err) {
        console.error('Error fetching videos:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch videos' });
    }
};

// Get video by ID (API)
exports.getVideoById = async (req, res) => {
    const { videoId } = req.params;
    try {
        const videos = await new Promise((resolve, reject) => {
            VideoEditor.getVideosByPageId(req.query.pageId, (err, videos) => {
                if (err) reject(err);
                resolve(videos);
            });
        });
        const video = videos.find(v => v.id == videoId);
        if (!video || !video.fileExists) {
            throw new Error('Video not found or file missing');
        }

        // Convert to relative path for client-side use
        const relativePath = toRelativePath(video.downloadedFile);
        if (!relativePath) {
            throw new Error('Invalid video file path');
        }
        video.downloadedFile = relativePath;

        res.json({ success: true, video });
    } catch (err) {
        console.error('Error fetching video:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch video' });
    }
};

// Render editor panel template
exports.getEditorPanel = async (req, res) => {
    const { videoId } = req.params;
    const { pageId, isEdited } = req.query;
    try {
        const videos = await new Promise((resolve, reject) => {
            if (isEdited === 'true') {
                VideoEditor.getEditedVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            } else {
                VideoEditor.getVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            }
        });

        const video = videos.find(v => isEdited === 'true' ? v.video_id == videoId : v.id == videoId);
        if (!video) {
            throw new Error('Video not found');
        }

        // Get the appropriate file path
        const filePath = isEdited === 'true' ? video.edited_file : video.downloadedFile;
        if (!filePath) {
            throw new Error('Video file path not found');
        }

        // Convert to relative path for template
        const relativePath = toRelativePath(filePath);
        if (!relativePath) {
            throw new Error('Invalid video file path');
        }

        res.render('pages/video_editor/editorPanel', {
            videoId: isEdited === 'true' ? video.video_id : video.id,
            title: video.title || (isEdited === 'true' ? 'Edited Video' : 'No Title'),
            downloadedFile: relativePath,
            pageId,
            isEdited: isEdited === 'true',
            layout: false
        });
    } catch (err) {
        console.error('Error rendering editor panel:', err);
        res.status(500).json({ success: false, error: `Failed to render editor panel: ${err.message}` });
    }
};