// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateProfile, updateSavedJobs, readNotifications, verifyUser, resendCode, forgotPassword, verifyResetCode, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', registerUser);
router.post('/verify', verifyUser);
router.post('/resend-code', resendCode);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/saved-jobs', protect, updateSavedJobs);
router.put('/notifications/read', protect, readNotifications);

module.exports = router;
