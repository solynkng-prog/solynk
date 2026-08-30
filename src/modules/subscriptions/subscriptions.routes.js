const express = require('express');
const router = express.Router();
const SubscriptionsController = require('./subscriptions.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

router.get('/plans', SubscriptionsController.getPlans);
router.post('/paystack/webhook', express.raw({ type: 'application/json' }), SubscriptionsController.paystackWebhook);

router.use(authenticate);

router.get('/current', SubscriptionsController.getCurrent);
router.post('/paystack/initialize', SubscriptionsController.initializePaystack);
router.get('/paystack/verify/:reference', SubscriptionsController.verifyPaystack);
router.post('/subscribe', SubscriptionsController.subscribe);
router.post('/upgrade', SubscriptionsController.upgrade);
router.post('/cancel', SubscriptionsController.cancel);
router.get('/invoices', SubscriptionsController.getInvoices);
router.get('/usage', SubscriptionsController.getUsage);

// Legacy Stripe webhook (raw body needed)
router.post('/webhook', express.raw({ type: 'application/json' }), SubscriptionsController.webhook);

module.exports = router;
