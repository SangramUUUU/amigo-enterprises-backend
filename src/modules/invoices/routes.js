const express = require('express');
const controller = require('./controller');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/form-options', controller.formOptions);
router.get('/:id/pdf', controller.exportPdf);
router.get('/:id/pdf-for-email', controller.exportPdf);
router.get('/:id/doc', controller.exportDoc);
router.get('/:id/form-data', controller.formData);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', requireRole('super_admin', 'admin'), controller.update);
router.post('/:id/finalize', requireRole('super_admin', 'admin'), controller.finalize);
router.post('/:id/cancel', requireRole('super_admin', 'admin'), controller.cancel);
router.delete('/:id', requireRole('super_admin', 'admin'), controller.remove);
router.post('/:id/payments', requireRole('super_admin', 'admin'), controller.addPayment);

module.exports = router;
