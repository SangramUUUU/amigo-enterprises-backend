const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('super_admin', 'admin'));

router.get('/status', controller.status);
router.post('/request', controller.request);
router.post('/verify', controller.verify);

module.exports = router;
