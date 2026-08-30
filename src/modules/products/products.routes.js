const express = require('express');
const ProductsController = require('./products.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

const router = express.Router();

router.get('/', ProductsController.list);
router.get('/mine', authenticate, ProductsController.sellerProducts);
router.get('/:id', ProductsController.getOne);

module.exports = router;
