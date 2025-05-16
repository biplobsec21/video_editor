const VideoEditor = require('../database/videoEditorModel');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { toRelativePath, toAbsolutePath, normalizePath } = require('../utils/pathUtils');

// Define paths
const publicDir = path.join(__dirname, '../public');
const editedVideosDir = path.join(publicDir, 'edited_videos');
const thumbnailsDir = path.join(publicDir, 'thumbnails');

// Create necessary directories with proper permissions
async function ensureDirectoriesExist() {
    try {
        // Create public directory if it doesn't exist
        await fs.mkdir(publicDir, { recursive: true, mode: 0o755 });

        // Create edited_videos directory if it doesn't exist
        await fs.mkdir(editedVideosDir, { recursive: true, mode: 0o755 });

        // Create thumbnails directory if it doesn't exist
        await fs.mkdir(thumbnailsDir, { recursive: true, mode: 0o755 });

        // Double-check permissions
        await fs.chmod(editedVideosDir, 0o755);
        await fs.chmod(thumbnailsDir, 0o755);

        console.log('Directories created and permissions set');
    } catch (err) {
        console.error('Error creating directories:', err);
        throw new Error('Failed to create or set permissions on necessary directories');
    }
}

// Generate thumbnail from video
async function generateThumbnail(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['50%'],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '320x240'
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });
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
            textOverlays,
            sourceFile
        } = req.body;

        // Normalize input path - use sourceFile directly if provided
        let inputPath;
        if (sourceFile) {
            // If sourceFile is provided, use it (this will be the edited video path when editing an edited video)
            inputPath = path.join(publicDir, sourceFile);
        } else {
            // Otherwise, get the original video
            const videos = await new Promise((resolve, reject) => {
                VideoEditor.getVideosByPageId(pageId, (err, videos) => {
                    if (err) reject(err);
                    resolve(videos);
                });
            });

            const originalVideo = videos.find(v => v.id == videoId);
            if (!originalVideo || !originalVideo.fileExists) {
                throw new Error('Original video not found or file missing');
            }
            inputPath = path.join(publicDir, originalVideo.downloadedFile);
        }

        inputPath = path.normalize(inputPath);

        // Verify input file exists
        await fs.access(inputPath).catch(() => {
            throw new Error(`Input file does not exist: ${inputPath}`);
        });

        // Generate output paths
        const timestamp = Date.now();
        const outputFileName = `${videoId}_${timestamp}_edited.mp4`;
        const outputPath = path.join(editedVideosDir, outputFileName);
        const relativePath = path.join('edited_videos', outputFileName).replace(/\\/g, '/');

        // Generate thumbnail paths
        const thumbnailFileName = `${videoId}_${timestamp}_thumb.jpg`;
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFileName);
        const relativeThumbnailPath = path.join('thumbnails', thumbnailFileName).replace(/\\/g, '/');

        console.log('Processing video with paths:', {
            inputPath,
            outputPath,
            relativePath,
            thumbnailPath
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
            command.setDuration((trimEnd || originalVideo.durationMs / 1000) - (trimStart || 0));
        }

        if (cropWidth && cropHeight) {
            command.videoFilter(`crop=${cropWidth}:${cropHeight}:${cropX || 0}:${cropY || 0}`);
        }

        // Handle multiple text overlays
        if (textOverlays && textOverlays.length > 0) {
            const textFilters = textOverlays.map(overlay => {
                const {
                    text,
                    startTime,
                    endTime,
                    x,
                    y,
                    fontSize,
                    color,
                    bgColor,
                    bgOpacity
                } = overlay;

                // Convert percentage positions to expressions that calculate pixel positions
                const xPos = x ? `(w-text_w)*${parseInt(x) / 100}` : '(w-text_w)/2';
                const yPos = y ? `(h-text_h)*${parseInt(y) / 100}` : '(h-text_h)/2';

                // Build the drawtext filter with all options
                return [
                    `drawtext=text='${text.replace(/'/g, "'\\\\\\''")}'`,
                    `fontcolor=${color?.replace('#', '0x') || 'white'}`,
                    `fontsize=${fontSize || 24}`,
                    `x=${xPos}`,
                    `y=${yPos}`,
                    `fontfile=/System/Library/Fonts/Supplemental/Bangla\ MN.ttc`,
                    'box=1',
                    `boxcolor=${bgColor?.replace('#', '0x') || '000000'}@${(parseInt(bgOpacity) || 50) / 100}`,
                    'boxborderw=5',
                    `enable='between(t,${parseFloat(startTime) || 0},${parseFloat(endTime) || originalVideo.durationMs / 1000})'`
                ].join(':');
            });

            // Apply all text filters
            if (textFilters.length > 0) {
                command.videoFilter(textFilters.join(','));
            }
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

        // Generate thumbnail
        await generateThumbnail(outputPath, thumbnailPath);

        // Verify output file
        const stats = await fs.stat(outputPath);
        if (stats.size === 0) {
            throw new Error('Generated video is empty');
        }

        // Save to database
        const editParams = {
            trim: trimStart || trimEnd ? {
                start: trimStart,
                end: trimEnd
            } : null,
            crop: cropWidth && cropHeight ? {
                width: cropWidth,
                height: cropHeight,
                x: cropX || 0,
                y: cropY || 0
            } : null,
            textOverlays: textOverlays || []
        };

        // Save to database and get the ID
        const savedId = await new Promise((resolve, reject) => {
            VideoEditor.saveEditedVideo(videoId, pageId, relativePath, relativeThumbnailPath, editParams, (err, id) => {
                if (err) reject(err);
                resolve(id);
            });
        });

        res.json({
            success: true,
            editedFile: relativePath,
            thumbnail: relativeThumbnailPath,
            timestamp: timestamp,
            videoId: savedId // Include the saved video ID in the response
        });
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
    const { pageId, isEdited, sourceFile } = req.query;
    try {
        const videos = await new Promise((resolve, reject) => {
            if (isEdited === 'true') {
                VideoEditor.getEditedVideosByPageId(pageId, videoId, (err, videos) => {
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

        // Use provided source file or default to original file
        const filePath = sourceFile || (isEdited === 'true' ? video.edited_file : video.downloadedFile);
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
            downloadedFile: video.downloadedFile,
            sourceFile: relativePath,
            pageId,
            layout: false
        });
    } catch (err) {
        console.error('Error rendering editor panel:', err);
        res.status(500).json({ success: false, error: `Failed to render editor panel: ${err.message}` });
    }
};

// Get edit history for a video
exports.getEditHistory = async (req, res) => {
    const { videoId } = req.params;
    const { pageId } = req.query;

    try {
        // Get edited video details
        const editedVideos = await new Promise((resolve, reject) => {
            VideoEditor.getEditedVideosByPageId(pageId, videoId, (err, videos) => {
                if (err) reject(err);
                resolve(videos);
            });
        });

        // Find the specific edited video
        const editedVideo = editedVideos[0]; // Get the first (and should be only) result

        if (!editedVideo) {
            return res.status(404).json({
                success: false,
                error: 'No edit history found for this video'
            });
        }

        // Return the edit parameters
        res.json({
            success: true,
            edit_params: editedVideo.edit_params,
            edited_file: editedVideo.edited_file
        });
    } catch (err) {
        console.error('Error fetching edit history:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch edit history'
        });
    }
};