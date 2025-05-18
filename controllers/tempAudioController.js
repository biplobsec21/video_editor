const TempAudioModel = require('../models/tempAudioModel');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const youtubeDl = require('youtube-dl-exec');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

// Define paths
const publicDir = path.join(__dirname, '../public');
const tempAudioDir = path.join(publicDir, 'uploads/temp_audio');
const playlistDir = '/Volumes/PIKACHU/playlists';

// Create necessary directories with proper permissions
async function ensureDirectoriesExist() {
    try {
        console.log('Checking directory permissions...');
        console.log('Public directory path:', publicDir);
        console.log('Audio directory path:', tempAudioDir);
        console.log('Playlist directory path:', playlistDir);

        // Create public directory if it doesn't exist
        await fs.mkdir(publicDir, { recursive: true, mode: 0o755 });
        console.log('Public directory created/verified');

        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(publicDir, 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
        console.log('Uploads directory created/verified');

        // Create audio directory if it doesn't exist
        await fs.mkdir(tempAudioDir, { recursive: true, mode: 0o755 });
        console.log('Audio directory created/verified');

        // Create playlist directory if it doesn't exist
        await fs.mkdir(playlistDir, { recursive: true, mode: 0o755 });
        console.log('Playlist directory created/verified');

        // Double-check permissions
        await fs.chmod(uploadsDir, 0o755);
        await fs.chmod(tempAudioDir, 0o755);
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

class TempAudioController {
    static async renderLibrary(req, res) {
        try {
            await ensureDirectoriesExist();
            const audioFiles = await TempAudioModel.getAll();
            res.render('pages/temp_audio/library', { audioFiles });
        } catch (error) {
            console.error('Error rendering audio library:', error);
            res.status(500).json({ success: false, message: 'Error loading audio library' });
        }
    }

    static async uploadAudio(req, res) {
        if (!req.files) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const results = [];
        const errors = [];

        try {
            await ensureDirectoriesExist();
            const files = Array.isArray(req.files.audio) ? req.files.audio : [req.files.audio];
            console.log(`Processing ${files.length} file(s)`);

            await Promise.all(files.map(async (audioFile) => {
                try {
                    console.log(`Processing file: ${audioFile.name}`);

                    // Use original filename
                    const filename = audioFile.name;
                    const filePath = path.join(tempAudioDir, filename);

                    // Move the file
                    await audioFile.mv(filePath);
                    console.log('File moved successfully');

                    // Get audio metadata
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

                    const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
                    const duration = metadata.format.duration;

                    // Create database entry
                    const audioData = {
                        filename: filename,
                        originalName: audioFile.name,
                        filePath: `/uploads/temp_audio/${filename}`,
                        fileSize: (await fs.stat(filePath)).size,
                        duration: duration || 0,
                        bitrate: audioStream?.bit_rate || 0,
                        sampleRate: audioStream?.sample_rate || 0,
                        channels: audioStream?.channels || 0
                    };

                    const audioId = await TempAudioModel.create(audioData);
                    results.push({
                        id: audioId,
                        ...audioData
                    });
                } catch (error) {
                    console.error(`Error processing file ${audioFile.name}:`, error);
                    errors.push({
                        filename: audioFile.name,
                        error: error.message
                    });
                }
            }));

            res.json({
                success: true,
                audioFiles: results,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            console.error('Error uploading audio files:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading audio files',
                errors: errors.length > 0 ? errors : undefined
            });
        }
    }

    static async deleteAudio(req, res) {
        try {
            const { id } = req.params;
            const audio = await TempAudioModel.getById(id);

            if (!audio) {
                return res.status(404).json({ success: false, message: 'Audio file not found' });
            }

            // Delete the file
            const filePath = path.join(publicDir, audio.file_path);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.error('Error deleting file:', error);
            }

            // Delete from database
            const success = await TempAudioModel.deleteById(id);

            if (success) {
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, message: 'Audio file not found' });
            }
        } catch (error) {
            console.error('Error deleting audio file:', error);
            res.status(500).json({ success: false, message: 'Error deleting audio file' });
        }
    }

    static async getAudioFiles(req, res) {
        try {
            const audioFiles = await TempAudioModel.getAll();
            res.json({ success: true, audioFiles });
        } catch (error) {
            console.error('Error getting audio files:', error);
            res.status(500).json({ success: false, message: 'Error loading audio files' });
        }
    }

    static async downloadYouTubeAudio(req, res) {
        const { url, audioType } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        try {
            await ensureDirectoriesExist();

            if (audioType === 'playlist') {
                console.log('\n=== Starting Playlist Download ===');
                console.log('URL:', url);
                console.log('----------------------------------------');

                // Set up SSE
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                // Get playlist info
                const playlistInfo = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                    extractAudio: true,
                    audioFormat: 'mp3',
                    audioQuality: 0, // Best quality
                });

                const totalTracks = playlistInfo.entries.length;
                console.log(`Found ${totalTracks} tracks in playlist: ${playlistInfo.title}`);

                // Create a subdirectory for this playlist
                const playlistName = playlistInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const playlistPath = path.join(playlistDir, playlistName);
                await fs.mkdir(playlistPath, { recursive: true, mode: 0o755 });

                // Send initial progress
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    total: totalTracks,
                    completed: 0,
                    current: null,
                    message: `Starting download of ${totalTracks} tracks...`,
                    playlistInfo: {
                        name: playlistInfo.title,
                        path: playlistPath,
                        totalTracks: totalTracks
                    }
                })}\n\n`);

                // Download tracks sequentially
                let completedTracks = 0;
                const results = [];
                const errors = [];

                for (const entry of playlistInfo.entries) {
                    try {
                        const trackTitle = entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const filename = `${trackTitle}.mp3`;
                        const filePath = path.join(playlistPath, filename);

                        // Send current track info
                        res.write(`data: ${JSON.stringify({
                            type: 'progress',
                            total: totalTracks,
                            completed: completedTracks,
                            current: {
                                title: entry.title,
                                filename: filename,
                                directory: playlistPath,
                                status: 'downloading'
                            },
                            message: `Downloading: ${entry.title}`
                        })}\n\n`);

                        // Download audio only
                        await youtubeDl(entry.webpage_url, {
                            output: filePath,
                            extractAudio: true,
                            audioFormat: 'mp3',
                            audioQuality: 0, // Best quality
                            noWarnings: true,
                            noCallHome: true,
                            noCheckCertificate: true,
                            preferFreeFormats: true,
                            youtubeSkipDashManifest: true,
                            format: 'bestaudio/best',
                            postprocessorArgs: [
                                '-codec:a', 'libmp3lame',
                                '-qscale:a', '0'
                            ]
                        });

                        // Get audio metadata
                        const metadata = await new Promise((resolve, reject) => {
                            ffmpeg.ffprobe(filePath, (err, metadata) => {
                                if (err) reject(err);
                                else resolve(metadata);
                            });
                        });

                        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
                        const duration = metadata.format.duration;
                        const fileSize = (await fs.stat(filePath)).size;

                        // Create database entry
                        const audioData = {
                            filename: filename,
                            originalName: entry.title,
                            filePath: filePath,
                            fileSize: fileSize,
                            duration: duration || 0,
                            bitrate: audioStream?.bit_rate || 0,
                            sampleRate: audioStream?.sample_rate || 0,
                            channels: audioStream?.channels || 0
                        };

                        const audioId = await TempAudioModel.create(audioData);
                        results.push({ id: audioId, ...audioData });
                        completedTracks++;

                        // Send progress update
                        res.write(`data: ${JSON.stringify({
                            type: 'progress',
                            total: totalTracks,
                            completed: completedTracks,
                            current: {
                                title: entry.title,
                                filename: filename,
                                directory: playlistPath,
                                status: 'completed',
                                size: fileSize,
                                duration: duration
                            },
                            message: `Completed: ${entry.title}`
                        })}\n\n`);

                    } catch (error) {
                        console.error(`Error downloading track:`, error);
                        errors.push({
                            title: entry.title,
                            error: error.message
                        });
                        completedTracks++;

                        res.write(`data: ${JSON.stringify({
                            type: 'error',
                            video: {
                                title: entry.title,
                                directory: playlistPath,
                                error: error.message
                            }
                        })}\n\n`);
                    }
                }

                // Send final update
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    total: totalTracks,
                    completed: completedTracks,
                    errors: errors.length,
                    message: `Downloaded ${completedTracks} tracks to ${playlistPath}`,
                    playlistInfo: {
                        name: playlistInfo.title,
                        path: playlistPath,
                        totalTracks: totalTracks,
                        completedTracks: completedTracks,
                        errors: errors.length
                    },
                    audioFiles: results,
                    errors: errors.length > 0 ? errors : undefined
                })}\n\n`);

                res.end();
            } else {
                // Single audio download
                const audioInfo = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                    extractAudio: true,
                    audioFormat: 'mp3',
                    audioQuality: 0, // Best quality
                });

                const audioTitle = audioInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = `${audioTitle}.mp3`;
                const filePath = path.join(tempAudioDir, filename);

                // Send initial progress
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    total: 1,
                    completed: 0,
                    current: {
                        title: audioInfo.title,
                        filename: filename,
                        directory: tempAudioDir,
                        status: 'downloading'
                    },
                    message: `Starting download of ${audioInfo.title}`
                })}\n\n`);

                // Download audio only with correct options
                await youtubeDl(url, {
                    output: filePath,
                    extractAudio: true,
                    audioFormat: 'mp3',
                    audioQuality: 0, // Best quality
                    noWarnings: true,
                    noCallHome: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                    format: 'bestaudio/best',
                    postprocessorArgs: [
                        '-codec:a', 'libmp3lame',
                        '-qscale:a', '0'
                    ]
                });

                // Get audio metadata
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(filePath, (err, metadata) => {
                        if (err) reject(err);
                        else resolve(metadata);
                    });
                });

                const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
                const duration = metadata.format.duration;
                const fileSize = (await fs.stat(filePath)).size;

                // Create database entry
                const audioData = {
                    filename: filename,
                    originalName: audioInfo.title,
                    filePath: `/uploads/temp_audio/${filename}`,
                    fileSize: fileSize,
                    duration: duration || 0,
                    bitrate: audioStream?.bit_rate || 0,
                    sampleRate: audioStream?.sample_rate || 0,
                    channels: audioStream?.channels || 0
                };

                const audioId = await TempAudioModel.create(audioData);

                // Send completion update
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    total: 1,
                    completed: 1,
                    current: {
                        title: audioInfo.title,
                        filename: filename,
                        directory: tempAudioDir,
                        status: 'completed',
                        size: fileSize,
                        duration: duration
                    },
                    message: `Downloaded ${audioInfo.title} to ${tempAudioDir}`,
                    audioFiles: [{ id: audioId, ...audioData }]
                })}\n\n`);

                res.end();
            }
        } catch (error) {
            console.error('Error downloading audio:', error);
            if (audioType === 'playlist') {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: 'Error downloading playlist',
                    error: error.message
                })}\n\n`);
                res.end();
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error downloading audio',
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

            // Extract track URLs and titles
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

module.exports = TempAudioController; 