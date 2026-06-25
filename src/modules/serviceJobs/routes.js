const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.post('/:id/complete', controller.complete);
router.post('/:id/generate-invoice', controller.generateInvoice);

module.exports = router;
