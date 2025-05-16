const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const videoController = require('../controllers/videoCollectionController');
const videoEditorController = require('../controllers/videoEditorController');

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

module.exports = router;