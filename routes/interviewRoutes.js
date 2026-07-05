// routes/interviewRoutes.js
const express = require('express');
const router = express.Router();
const { getInterviews, scheduleInterview, cancelInterview } = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getInterviews);
router.post('/', protect, authorize('employer'), scheduleInterview);
router.delete('/:id', protect, authorize('employer'), cancelInterview);

module.exports = router;
