const notificationApi = require('./notificationApi');

async function list(req, res, next) {
  try {
    const notifications = await notificationApi.listForUser(
      req.user.id,
      req.user.role,
      { type: req.query.type, unreadOnly: req.query.unread_only }
    );
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const count = await notificationApi.getUnreadCount(req.user.id, req.user.role);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await notificationApi.markRead(
      req.params.id,
      req.user.id,
      req.user.role
    );
    res.json({ notification });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, unreadCount, markRead };
