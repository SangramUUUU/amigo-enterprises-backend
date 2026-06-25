const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requireRole('super_admin', 'admin'), controller.create);
router.patch('/:id', requireRole('super_admin', 'admin'), controller.update);
router.delete('/:id', requireRole('super_admin', 'admin'), controller.remove);

module.exports = router;
