const express = require('express');
const router = express.Router();
const CalculatorController = require('./calculator.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { calculationLimiter } = require('../../shared/middleware/rate-limit.middleware');

// All calculator routes require authentication
router.use(authenticate);

// Apply calculation rate limiter
router.use(calculationLimiter);

router.post('/', CalculatorController.calculate);
router.post('/optimize', CalculatorController.optimize);
router.get('/history', CalculatorController.getHistory);
router.get('/defaults', CalculatorController.getDefaults);

module.exports = router;
