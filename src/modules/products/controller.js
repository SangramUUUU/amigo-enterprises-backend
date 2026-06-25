const productService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');

async function list(req, res, next) {
  try {
    const products = await productService.listProducts({
      q: req.query.q,
      includeInactive: req.query.includeInactive === 'true',
      productType: req.query.product_type,
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const product = await productService.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found' });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.name) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name is required' });
    }
    const product = await productService.createProduct(req.body);
    await writeAuditLog(req.user.id, 'create', 'product', product.id, { name: product.name });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    await writeAuditLog(req.user.id, 'update', 'product', product.id, req.body);
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const product = await productService.softDeleteProduct(req.params.id);
    await writeAuditLog(req.user.id, 'deactivate', 'product', product.id, {});
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    const { reason, quantity_change, notes } = req.body;
    if (!reason || quantity_change === undefined) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'reason and quantity_change are required',
      });
    }
    const result = await productService.adjustStock(req.params.id, req.user.id, {
      reason,
      quantity_change,
      notes,
    });
    await writeAuditLog(req.user.id, 'stock_adjustment', 'product', req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function stockHistory(req, res, next) {
  try {
    const adjustments = await productService.listStockAdjustments(req.params.id);
    res.json({ adjustments });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove, adjustStock, stockHistory };
