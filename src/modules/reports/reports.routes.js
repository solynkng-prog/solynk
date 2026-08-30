const express = require('express');
const router = express.Router();
const ReportsController = require('./reports.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

router.use(authenticate);

router.post('/pdf', ReportsController.generatePDF);
router.post('/bom', ReportsController.generateBOM);
router.get('/', ReportsController.list);
router.get('/:id/status', ReportsController.getStatus);
router.get('/:id/download', ReportsController.download);
router.delete('/:id', ReportsController.delete);

module.exports = router;
