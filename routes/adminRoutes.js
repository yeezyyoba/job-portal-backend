// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getUsers, 
  toggleUserSuspension, 
  deleteUser, 
  verifyEmployer, 
  getModerationJobs, 
  approveJob, 
  getSettings, 
  updateSettings,
  createAdmin
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// Public settings route
router.get('/settings', getSettings);

// Protected Admin actions routes
router.use(protect, authorize('admin', 'superadmin'));

router.get('/users', getUsers);
router.post('/users/admin', authorize('superadmin'), createAdmin);
router.put('/users/:email/status', toggleUserSuspension);
router.delete('/users/:email', deleteUser);
router.put('/verification/:email', verifyEmployer);
router.get('/jobs', getModerationJobs);
router.put('/jobs/:id/approve', approveJob);
router.put('/settings', authorize('superadmin'), updateSettings);

module.exports = router;
