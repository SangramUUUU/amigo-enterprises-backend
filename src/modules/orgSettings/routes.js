const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.get('/branding', controller.branding);
router.get('/media', requireAuth, controller.media);
router.get('/', requireAuth, controller.get);
router.put('/', requireAuth, requireRole('super_admin', 'admin'), controller.update);

module.exports = router;
