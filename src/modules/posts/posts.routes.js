const express = require('express');
const PostsController = require('./posts.controller');

const router = express.Router();

router.get('/', PostsController.list);
router.get('/:id', PostsController.get);
router.post('/', PostsController.create);
router.patch('/:id', PostsController.update);
router.delete('/:id', PostsController.remove);

module.exports = router;
