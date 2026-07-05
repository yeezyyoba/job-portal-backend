// routes/appRoutes.js
const express = require('express');
const router = express.Router();
const { getApplications, createApplication, updateApplicationStatus, withdrawApplication } = require('../controllers/appController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getApplications);
router.post('/', protect, authorize('seeker'), createApplication);
router.put('/:id/status', protect, authorize('employer'), updateApplicationStatus);
router.delete('/:id', protect, authorize('seeker'), withdrawApplication);

module.exports = router;
