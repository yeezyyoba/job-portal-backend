// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateProfile, verifyUser, resendCode } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', registerUser);
router.post('/verify', verifyUser);
router.post('/resend-code', resendCode);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

module.exports = router;
