const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id/stock-adjustments', controller.stockHistory);
router.post('/:id/stock-adjustments', controller.adjustStock);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
