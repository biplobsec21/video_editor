const TempVideoModel = require('../models/tempVideoModel');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const youtubeDl = require('youtube-dl-exec');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

// Define paths
const publicDir = path.join(__dirname, '../public');
const tempVideoDir = path.join(publicDir, 'uploads/temp_video');
const playlistDir = '/Volumes/PIKACHU/playlists';

// Create necessary directories with proper permissions
async function ensureDirectoriesExist() {
    try {
        console.log('Checking directory permissions...');
        console.log('Public directory path:', publicDir);
        console.log('Video directory path:', tempVideoDir);
        console.log('Playlist directory path:', playlistDir);

        // Create public directory if it doesn't exist
        await fs.mkdir(publicDir, { recursive: true, mode: 0o755 });
        console.log('Public directory created/verified');

        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(publicDir, 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
        console.log('Uploads directory created/verified');

        // Create video directory if it doesn't exist
        await fs.mkdir(tempVideoDir, { recursive: true, mode: 0o755 });
        console.log('Video directory created/verified');

        // Create playlist directory if it doesn't exist
        await fs.mkdir(playlistDir, { recursive: true, mode: 0o755 });
        console.log('Playlist directory created/verified');

        // Double-check permissions
        await fs.chmod(uploadsDir, 0o755);
        await fs.chmod(tempVideoDir, 0o755);
        await fs.chmod(playlistDir, 0o755);
        console.log('Directory permissions set to 755');

        console.log('All directories and permissions verified successfully');
    } catch (err) {
        console.error('Error in ensureDirectoriesExist:', err);
        console.error('Error details:', {
            code: err.code,
            path: err.path,
            message: err.message
        });
        throw new Error(`Failed to create or set permissions on necessary directories: ${err.message}`);
    }
}

class TempVideoController {
    static async renderLibrary(req, res) {
        try {
            await ensureDirectoriesExist();
            const videos = await TempVideoModel.getAll();
            res.render('pages/temp_video/library', { videos });
        } catch (error) {
            console.error('Error rendering video library:', error);
            res.status(500).json({ success: false, message: 'Error loading video library' });
        }
    }

    static async uploadVideo(req, res) {
        if (!req.files) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const results = [];
        const errors = [];

        try {
            await ensureDirectoriesExist();
            const files = Array.isArray(req.files.video) ? req.files.video : [req.files.video];
            console.log(`Processing ${files.length} file(s)`);

            await Promise.all(files.map(async (videoFile) => {
                try {
                    console.log(`Processing file: ${videoFile.name}`);

                    // Use original filename
                    const filename = videoFile.name;
                    const filePath = path.join(tempVideoDir, filename);

                    // Move the file
                    await videoFile.mv(filePath);
                    console.log('File moved successfully');

                    // Get video metadata
                    const metadata = await new Promise((resolve, reject) => {
                        ffmpeg.ffprobe(filePath, (err, metadata) => {
                            if (err) {
                                console.error('FFprobe error:', err);
                                reject(err);
                            } else {
                                resolve(metadata);
                            }
                        });
                    });

                    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                    const duration = metadata.format.duration;

                    // Create database entry
                    const videoData = {
                        filename: filename,
                        originalName: videoFile.name,
                        filePath: `/uploads/temp_video/${filename}`,
                        fileSize: (await fs.stat(filePath)).size,
                        duration: duration || 0,
                        resolutionWidth: videoStream?.width || 0,
                        resolutionHeight: videoStream?.height || 0
                    };

                    const videoId = await TempVideoModel.create(videoData);
                    results.push({
                        id: videoId,
                        ...videoData
                    });
                } catch (error) {
                    console.error(`Error processing file ${videoFile.name}:`, error);
                    errors.push({
                        filename: videoFile.name,
                        error: error.message
                    });
                }
            }));

            res.json({
                success: true,
                videos: results,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            console.error('Error uploading videos:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading videos',
                errors: errors.length > 0 ? errors : undefined
            });
        }
    }

    static async deleteVideo(req, res) {
        try {
            const { id } = req.params;
            const video = await TempVideoModel.getById(id);

            if (!video) {
                return res.status(404).json({ success: false, message: 'Video not found' });
            }

            // Delete the file
            const filePath = path.join(publicDir, video.file_path);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.error('Error deleting file:', error);
            }

            // Delete from database
            const success = await TempVideoModel.deleteById(id);

            if (success) {
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, message: 'Video not found' });
            }
        } catch (error) {
            console.error('Error deleting video:', error);
            res.status(500).json({ success: false, message: 'Error deleting video' });
        }
    }

    static async getVideos(req, res) {
        try {
            const videos = await TempVideoModel.getAll();
            res.json({ success: true, videos });
        } catch (error) {
            console.error('Error getting videos:', error);
            res.status(500).json({ success: false, message: 'Error loading videos' });
        }
    }

    static async downloadYouTubeVideo(req, res) {
        const { url, videoType } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        try {
            await ensureDirectoriesExist();

            if (videoType === 'playlist') {
                console.log('\n=== Starting Playlist Download ===');
                console.log('URL:', url);
                console.log('----------------------------------------');

                // Set up SSE
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                // Step 1: Get playlist info and collect all URLs
                console.log('Step 1: Collecting playlist information...');
                const playlistInfo = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                });

                const totalVideos = playlistInfo.entries.length;
                console.log(`Found ${totalVideos} videos in playlist: ${playlistInfo.title}`);

                // Create a subdirectory for this playlist
                const playlistName = playlistInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const playlistPath = path.join(playlistDir, playlistName);
                await fs.mkdir(playlistPath, { recursive: true, mode: 0o755 });

                console.log('\nPlaylist Details:');
                console.log('Name:', playlistInfo.title);
                console.log('Download Location:', playlistPath);
                console.log('----------------------------------------');

                // Step 2: Prepare video list
                console.log('\nStep 2: Preparing video list...');
                const videoList = playlistInfo.entries.map((entry, index) => ({
                    index: index + 1,
                    title: entry.title,
                    url: entry.webpage_url,
                    filename: `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`,
                    path: path.join(playlistPath, `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`)
                }));

                console.log('Video list prepared. Starting downloads...');
                console.log('----------------------------------------');

                // Send initial progress
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    total: totalVideos,
                    completed: 0,
                    current: null,
                    message: `Starting download of ${totalVideos} videos...`,
                    playlistInfo: {
                        name: playlistInfo.title,
                        path: playlistPath,
                        totalVideos: totalVideos
                    }
                })}\n\n`);

                // Step 3: Download videos sequentially
                console.log('\nStep 3: Starting sequential downloads...');
                let completedVideos = 0;
                const results = [];
                const errors = [];

                for (const video of videoList) {
                    try {
                        console.log(`\n[${video.index}/${totalVideos}] Downloading: ${video.title}`);
                        console.log('URL:', video.url);
                        console.log('Filename:', video.filename);
                        console.log('Location:', video.path);

                        // Send current video info
                        res.write(`data: ${JSON.stringify({
                            type: 'progress',
                            total: totalVideos,
                            completed: completedVideos,
                            current: {
                                title: video.title,
                                filename: video.filename,
                                directory: playlistPath,
                                status: 'downloading'
                            },
                            message: `Downloading: ${video.title}`
                        })}\n\n`);

                        // Download video
                        await youtubeDl(video.url, {
                            output: video.path,
                            format: 'best[ext=mp4]',
                            noWarnings: true,
                            noCallHome: true,
                            noCheckCertificate: true,
                            preferFreeFormats: true,
                            youtubeSkipDashManifest: true,
                        });

                        // Get video metadata
                        const metadata = await new Promise((resolve, reject) => {
                            ffmpeg.ffprobe(video.path, (err, metadata) => {
                                if (err) reject(err);
                                else resolve(metadata);
                            });
                        });

                        const videoMetadata = metadata.streams.find(stream => stream.codec_type === 'video');
                        const duration = metadata.format.duration;
                        const fileSize = (await fs.stat(video.path)).size;

                        console.log('✓ Download Complete');
                        console.log('Size:', (fileSize / (1024 * 1024)).toFixed(2), 'MB');
                        console.log('Duration:', Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0'));
                        console.log('Resolution:', `${videoMetadata?.width || 0}x${videoMetadata?.height || 0}`);

                        // Create database entry
                        const videoData = {
                            filename: video.filename,
                            originalName: video.title,
                            filePath: video.path,
                            fileSize: fileSize,
                            duration: duration || 0,
                            resolutionWidth: videoMetadata?.width || 0,
                            resolutionHeight: videoMetadata?.height || 0
                        };

                        const videoId = await TempVideoModel.create(videoData);
                        results.push({ id: videoId, ...videoData });
                        completedVideos++;

                        // Send progress update
                        res.write(`data: ${JSON.stringify({
                            type: 'progress',
                            total: totalVideos,
                            completed: completedVideos,
                            current: {
                                title: video.title,
                                filename: video.filename,
                                directory: playlistPath,
                                status: 'completed',
                                size: fileSize,
                                duration: duration
                            },
                            message: `Completed: ${video.title}`
                        })}\n\n`);

                    } catch (error) {
                        console.error(`\n❌ Error downloading video ${video.index}:`);
                        console.error('Title:', video.title);
                        console.error('URL:', video.url);
                        console.error('Error:', error.message);
                        console.error('----------------------------------------');

                        errors.push({
                            videoId: video.index,
                            title: video.title,
                            url: video.url,
                            error: error.message
                        });
                        completedVideos++;

                        // Send error update
                        res.write(`data: ${JSON.stringify({
                            type: 'error',
                            video: {
                                title: video.title,
                                directory: playlistPath,
                                error: error.message
                            }
                        })}\n\n`);
                    }
                }

                // Final summary
                console.log('\n=== Download Summary ===');
                console.log('Playlist:', playlistInfo.title);
                console.log('Total Videos:', totalVideos);
                console.log('Successfully Downloaded:', completedVideos - errors.length);
                console.log('Failed:', errors.length);
                console.log('Location:', playlistPath);
                if (errors.length > 0) {
                    console.log('\nFailed Downloads:');
                    errors.forEach(error => {
                        console.log(`- ${error.title} (${error.url})`);
                        console.log(`  Error: ${error.error}`);
                    });
                }
                console.log('========================================\n');

                // Send final update
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    total: totalVideos,
                    completed: completedVideos,
                    errors: errors.length,
                    message: `Downloaded ${completedVideos} videos to ${playlistPath}`,
                    playlistInfo: {
                        name: playlistInfo.title,
                        path: playlistPath,
                        totalVideos: totalVideos,
                        completedVideos: completedVideos,
                        errors: errors.length
                    },
                    videos: results,
                    errors: errors.length > 0 ? errors : undefined
                })}\n\n`);

                res.end();
            } else {
                console.log('\n=== Starting Single Video Download ===');
                console.log('URL:', url);
                console.log('----------------------------------------');

                // Single video download
                const videoInfo = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                });

                const videoTitle = videoInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = `${videoTitle}.mp4`;
                const filePath = path.join(tempVideoDir, filename);

                console.log('Title:', videoInfo.title);
                console.log('Filename:', filename);
                console.log('Location:', filePath);
                console.log('----------------------------------------');

                // Send initial progress
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    total: 1,
                    completed: 0,
                    current: {
                        title: videoInfo.title,
                        filename: filename,
                        directory: tempVideoDir,
                        status: 'downloading'
                    },
                    message: `Starting download of ${videoInfo.title}`
                })}\n\n`);

                // Download video
                await youtubeDl(url, {
                    output: filePath,
                    format: 'best[ext=mp4]',
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                });

                // Get video metadata
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(filePath, (err, metadata) => {
                        if (err) reject(err);
                        else resolve(metadata);
                    });
                });

                const videoMetadata = metadata.streams.find(stream => stream.codec_type === 'video');
                const duration = metadata.format.duration;
                const fileSize = (await fs.stat(filePath)).size;

                console.log('✓ Download Complete');
                console.log('Size:', (fileSize / (1024 * 1024)).toFixed(2), 'MB');
                console.log('Duration:', Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0'));
                console.log('Resolution:', `${videoMetadata?.width || 0}x${videoMetadata?.height || 0}`);
                console.log('========================================\n');

                // Create database entry
                const videoData = {
                    filename: filename,
                    originalName: videoInfo.title,
                    filePath: `/uploads/temp_video/${filename}`,
                    fileSize: fileSize,
                    duration: duration || 0,
                    resolutionWidth: videoMetadata?.width || 0,
                    resolutionHeight: videoMetadata?.height || 0
                };

                const videoId = await TempVideoModel.create(videoData);

                // Send completion update
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    total: 1,
                    completed: 1,
                    current: {
                        title: videoInfo.title,
                        filename: filename,
                        directory: tempVideoDir,
                        status: 'completed',
                        size: fileSize,
                        duration: duration
                    },
                    message: `Downloaded ${videoInfo.title} to ${tempVideoDir}`,
                    videos: [{ id: videoId, ...videoData }]
                })}\n\n`);

                res.end();
            }
        } catch (error) {
            console.error('\n❌ Download Error:');
            console.error('Error:', error.message);
            console.error('----------------------------------------');

            if (videoType === 'playlist') {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: 'Error downloading playlist',
                    error: error.message
                })}\n\n`);
                res.end();
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error downloading video',
                    error: error.message
                });
            }
        }
    }

    static async fetchPlaylistUrls(req, res) {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        try {
            // Get playlist info
            const playlistInfo = await youtubeDl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCallHome: true,
                noCheckCertificate: true,
                preferFreeFormats: true,
                youtubeSkipDashManifest: true,
            });

            // Extract video URLs and titles
            const urls = playlistInfo.entries.map(entry => ({
                url: entry.webpage_url,
                title: entry.title
            }));

            res.json({
                success: true,
                urls: urls
            });
        } catch (error) {
            console.error('Error fetching playlist URLs:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching playlist URLs',
                error: error.message
            });
        }
    }
}

module.exports = TempVideoController; 