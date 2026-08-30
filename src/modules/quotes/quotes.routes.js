const express = require('express');
const router = express.Router();
const QuotesController = require('./quotes.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

router.use(authenticate);

router.get('/', QuotesController.list);
router.get('/:id', QuotesController.getOne);
router.patch('/:id/respond', QuotesController.respond);
router.patch('/:id/accept', QuotesController.accept);
router.patch('/:id/decline', QuotesController.decline);
router.delete('/:id', QuotesController.cancel);

module.exports = router;
