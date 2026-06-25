const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');

const router = express.Router();

router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);

module.exports = router;
