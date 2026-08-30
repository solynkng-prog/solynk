const express = require('express');
const router = express.Router();
const InstallersController = require('./installers.controller');
const { authenticate, optionalAuth } = require('../../shared/middleware/auth.middleware');

// Public routes
router.get('/', InstallersController.list);
router.get('/nearby', InstallersController.nearby);
router.get('/:id', InstallersController.getOne);
router.get('/:id/reviews', InstallersController.getReviews);

// Protected routes
router.post('/:id/reviews', authenticate, InstallersController.createReview);
router.post('/:id/quotes', authenticate, InstallersController.requestQuote);

module.exports = router;
