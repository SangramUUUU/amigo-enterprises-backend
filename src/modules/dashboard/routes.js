const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');

const router = express.Router();

router.get('/stats', requireAuth, controller.stats);

module.exports = router;
