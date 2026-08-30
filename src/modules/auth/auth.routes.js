const express = require('express');
const router = express.Router();
const AuthController = require('./auth.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { authLimiter } = require('../../shared/middleware/rate-limit.middleware');

// Apply stricter rate limiting to auth endpoints
router.use(authLimiter);

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/google', AuthController.googleSignIn);
router.post('/logout', authenticate, AuthController.logout);
router.post('/forgot-password', AuthController.forgotPassword);

// Protected routes
router.get('/me', authenticate, AuthController.getMe);
router.patch('/me', authenticate, AuthController.updateMe);
router.delete('/me', authenticate, AuthController.deleteAccount);

module.exports = router;
