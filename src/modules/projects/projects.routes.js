const express = require('express');
const router = express.Router();
const ProjectsController = require('./projects.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

router.use(authenticate);

router.post('/', ProjectsController.create);
router.get('/', ProjectsController.list);
router.get('/public', ProjectsController.listPublic);
router.get('/:id', ProjectsController.getOne);
router.put('/:id', ProjectsController.update);
router.delete('/:id', ProjectsController.delete);
router.post('/:id/duplicate', ProjectsController.duplicate);
router.post('/:id/share', ProjectsController.share);

module.exports = router;
