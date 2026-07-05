// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const { createReport, getReports, updateReportStatus } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('seeker'), createReport);
router.get('/', protect, authorize('admin'), getReports);
router.put('/:id/status', protect, authorize('admin'), updateReportStatus);

module.exports = router;
