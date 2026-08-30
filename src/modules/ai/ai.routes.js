const express = require('express');
const router = express.Router();
const AIController = require('./ai.controller');
const { authenticate, optionalAuth } = require('../../shared/middleware/auth.middleware');

router.post('/optimize', optionalAuth, AIController.optimize);
router.post('/recommend', optionalAuth, AIController.recommend);
router.post('/chat', optionalAuth, AIController.chat);
router.get('/suggestions/:projectId', authenticate, AIController.getSuggestions);

module.exports = router;
