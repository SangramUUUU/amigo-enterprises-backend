const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/:id/read', controller.markRead);

module.exports = router;
