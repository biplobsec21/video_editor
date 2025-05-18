const express = require('express');
const router = express.Router();
const path = require('path');
const pageController = require('../controllers/pageController');
const videoController = require('../controllers/videoCollectionController');
const videoEditorController = require('../controllers/videoEditorController');
const contentCollectionController = require('../controllers/contentCollectionController');
const tempVideoController = require('../controllers/tempVideoController');
const fileUpload = require('express-fileupload');

// Configure fileUpload middleware
const fileUploadConfig = fileUpload({
    createParentPath: true,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB max file size
    },
    abortOnLimit: true,
    responseOnLimit: 'File size limit has been reached',
    useTempFiles: false,
    debug: true
});

const authenticate = (req, res, next) => {
    // Placeholder: Add actual authentication logic
    next();
};
// Page routes
router.get('/', pageController.listPages);
router.get('/sync', pageController.syncPages);
router.delete('/page/:id', pageController.deletePage);
router.put('/page/:id', pageController.updatePage);


// Existing routes
router.get('/video_collection', authenticate, videoController.lists);
router.post('/video_collection/upload', authenticate, videoController.uploadJson);
router.get('/video_collection/reels/:pageId', authenticate, videoController.getReels);
router.post('/video_collection/download/:pageId', authenticate, videoController.downloadReels);
router.get('/video_collection/page/:pageId', authenticate, videoController.getPageDetails);


// Video Editor routes
router.get('/video_editor', authenticate, videoEditorController.renderEditor);
router.post('/video_editor/process', authenticate, videoEditorController.processVideo);
router.get('/video_editor/videos/:pageId', authenticate, videoEditorController.getVideosByPageId);
router.get('/video_editor/video/:videoId', authenticate, videoEditorController.getVideoById);
router.get('/video_editor/editorPanel/:videoId', authenticate, videoEditorController.getEditorPanel);
router.get('/video_editor/editHistory/:videoId', authenticate, videoEditorController.getEditHistory);

// Content Collection routes
router.get('/content_collection', authenticate, contentCollectionController.renderContentCollection);
router.get('/content_collection/create', authenticate, contentCollectionController.renderCreateForm);
router.post('/content_collection', authenticate, contentCollectionController.createContent);
router.get('/content_collection/edit/:id', authenticate, contentCollectionController.renderEditForm);
router.put('/content_collection/:id', authenticate, contentCollectionController.updateContent);
router.delete('/content_collection/:id', authenticate, contentCollectionController.deleteContent);
router.get('/content_collection/search', authenticate, contentCollectionController.searchContent);

// Temp Video Library Routes
router.get('/temp_video', tempVideoController.renderLibrary);
router.post('/temp_video/upload', fileUpload({
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    useTempFiles: false
}), tempVideoController.uploadVideo);
router.delete('/temp_video/:id', tempVideoController.deleteVideo);
router.get('/temp_video/list', tempVideoController.getVideos);
router.post('/temp_video/download-youtube', tempVideoController.downloadYouTubeVideo);
router.post('/temp_video/fetch-playlist-urls', tempVideoController.fetchPlaylistUrls);

module.exports = router;