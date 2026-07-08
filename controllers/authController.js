// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { get, run } = require('../config/db');
const sendEmail = require('../utils/sendEmail');
require('dotenv').config();

// Helper to generate JWT
const generateToken = (email) => {
  return jwt.sign({ email }, process.env.JWT_SECRET || 'super_secret_job_portal_key_2026', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const { email, password, role, name, companyName, phone, dob, gender, address, industry, website } = req.body;

    if (!email || !password || !role) {
      res.statusCode = 400;
      throw new Error('Please include email, password and role type');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user exist
    const userExists = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (userExists) {
      // Verify password first to check if they own the account
      const isMatch = bcrypt.compareSync(password, userExists.password);
      if (isMatch) {
        if (userExists.role === role || userExists.role === 'both') {
          res.statusCode = 400;
          throw new Error('User already exists with this email address and role');
        }

        // Upgrade user role to 'both'
        if (role === 'employer') {
          const logo = req.body.logo || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop&q=80";
          const ind = industry || "Technology / SaaS";
          const web = website || "https://example.com";
          const description = req.body.description || "New registered employer workspace on JobPortal.";
          const socialMedia = JSON.stringify({ twitter: '', linkedin: '' });
          const verified = 0; // Not verified by default

          await run(
            `UPDATE users SET role = 'both', companyName = ?, logo = ?, industry = ?, website = ?, description = ?, socialMedia = ?, verified = ? WHERE email = ?`,
            [companyName || name, logo, ind, web, description, socialMedia, verified, normalizedEmail]
          );
        } else if (role === 'seeker') {
          const skills = JSON.stringify([]);
          const education = JSON.stringify([]);
          const certifications = JSON.stringify([]);
          const experience = JSON.stringify([]);
          const languages = JSON.stringify([]);

          await run(
            `UPDATE users SET role = 'both', name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address), dob = COALESCE(?, dob), gender = COALESCE(?, gender), skills = ?, education = ?, certifications = ?, experience = ?, languages = ? WHERE email = ?`,
            [name, phone || null, address || null, dob || null, gender || null, skills, education, certifications, experience, languages, normalizedEmail]
          );
        }

        return res.status(200).json({
          message: 'Account successfully upgraded to support both seeker and employer roles.',
          email: normalizedEmail,
          verificationRequired: false,
          token: generateToken(normalizedEmail),
          role: 'both'
        });
      } else {
        if (userExists.emailVerified === 1) {
          res.statusCode = 401;
          throw new Error('Email is already registered. Please provide the correct password to add this role to your account.');
        }
        // Delete unverified user to start fresh
        await run('DELETE FROM users WHERE email = ?', [normalizedEmail]);
      }
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Prepare default columns
    const status = 'Active';
    const notifications = JSON.stringify([]);
    const savedJobs = JSON.stringify([]);

    // Generate 6-digit verification code and 15 min expiry
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = (Date.now() + 15 * 60 * 1000).toString();
    const emailVerified = 0;

    if (role === 'employer') {
      const logo = req.body.logo || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop&q=80";
      const ind = industry || "Technology / SaaS";
      const web = website || "https://example.com";
      const description = req.body.description || "New registered employer workspace on JobPortal.";
      const socialMedia = JSON.stringify({ twitter: '', linkedin: '' });
      const verified = 0; // Not verified by default

      await run(
        `INSERT INTO users (email, role, password, companyName, phone, logo, industry, website, description, socialMedia, verified, status, notifications, savedJobs, emailVerified, verificationCode, verificationCodeExpires) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [normalizedEmail, role, hashedPassword, companyName || name, phone || null, logo, ind, web, description, socialMedia, verified, status, notifications, savedJobs, emailVerified, verificationCode, verificationCodeExpires]
      );
    } else if (role === 'seeker') {
      const skills = JSON.stringify([]);
      const education = JSON.stringify([]);
      const certifications = JSON.stringify([]);
      const experience = JSON.stringify([]);
      const languages = JSON.stringify([]);

      await run(
        `INSERT INTO users (email, role, password, name, phone, address, dob, gender, skills, education, certifications, experience, languages, status, notifications, savedJobs, emailVerified, verificationCode, verificationCodeExpires) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [normalizedEmail, role, hashedPassword, name, phone || null, address || null, dob || null, gender || null, skills, education, certifications, experience, languages, status, notifications, savedJobs, emailVerified, verificationCode, verificationCodeExpires]
      );
    } else {
      res.statusCode = 400;
      throw new Error('Invalid user role specified');
    }

    // Send the email
    await sendEmail({
      to: email,
      subject: 'Verify Your JobPortal Account',
      text: `Your verification code is ${verificationCode}. It will expire in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4F46E5; margin-top: 0;">Welcome to JobPortal!</h2>
          <p>Thank you for registering. Please use the verification code below to complete your sign-up:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 5px; letter-spacing: 5px; margin: 20px 0; color: #1f2937;">
            ${verificationCode}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code will expire in 15 minutes.</p>
        </div>
      `
    });

    res.status(200).json({
      message: 'Verification code sent to your email.',
      email: normalizedEmail,
      verificationRequired: true
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.statusCode = 400;
      throw new Error('Please include email and password');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    if (!user) {
      res.statusCode = 401;
      throw new Error('Invalid email or password credentials');
    }

    if (user.status === 'Suspended') {
      res.statusCode = 403;
      throw new Error('Access denied, your account has been suspended by administration');
    }

    // Verify Password
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      res.statusCode = 401;
      throw new Error('Invalid email or password credentials');
    }

    // Verify Email Verification Status
    if (user.emailVerified === 0) {
      res.status(403).json({
        message: 'Your email address is not verified. Please check your inbox for the verification code.',
        email: user.email,
        verificationRequired: true
      });
      return;
    }

    res.json({
      email: user.email,
      role: user.role,
      token: generateToken(user.email)
    });
  } catch (error) {
    next(error);
  }
};

// Helper to parse DB text columns to JSON
const parseUserJSON = (user) => {
  if (!user) return null;
  const parsed = { ...user };
  delete parsed.password; // Strip password

  try { parsed.skills = JSON.parse(parsed.skills || '[]'); } catch(e) {}
  try { parsed.education = JSON.parse(parsed.education || '[]'); } catch(e) {}
  try { parsed.certifications = JSON.parse(parsed.certifications || '[]'); } catch(e) {}
  try { parsed.experience = JSON.parse(parsed.experience || '[]'); } catch(e) {}
  try { parsed.languages = JSON.parse(parsed.languages || '[]'); } catch(e) {}
  try { parsed.savedJobs = JSON.parse(parsed.savedJobs || '[]'); } catch(e) {}
  try { parsed.notifications = JSON.parse(parsed.notifications || '[]'); } catch(e) {}
  try { parsed.socialMedia = JSON.parse(parsed.socialMedia || '{}'); } catch(e) {}
  
  // Convert sqlite verified status (0 or 1) to boolean
  parsed.verified = parsed.verified === 1;

  return parsed;
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [req.user.email]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('User not found');
    }
    res.json(parseUserJSON(user));
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile details
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const email = req.user.email;
    const user = await get('SELECT role FROM users WHERE email = ?', [email]);

    if (!user) {
      res.statusCode = 404;
      throw new Error('Profile not found');
    }

    if (user.role === 'seeker' || user.role === 'both') {
      const { name, phone, address, dob, gender, skills, languages, resumeName, resumeData, profilePhoto, savedJobs } = req.body;
      
      let finalResumeName = resumeName;
      if (resumeName && resumeData) {
        try {
          const buffer = Buffer.from(resumeData, 'base64');
          const uploadDir = path.join(__dirname, '../uploads/resumes');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const safeName = resumeName.replace(/[^a-zA-Z0-9.-]/g, '_');
          finalResumeName = `${Date.now()}_${safeName}`;
          const filePath = path.join(uploadDir, finalResumeName);
          fs.writeFileSync(filePath, buffer);
        } catch (e) {
          console.error("Failed to save resume file:", e);
        }
      }

      const skillsStr = skills ? JSON.stringify(Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim())) : undefined;
      const languagesStr = languages ? JSON.stringify(Array.isArray(languages) ? languages : languages.split(',').map(l => l.trim())) : undefined;
      const savedJobsStr = savedJobs !== undefined ? JSON.stringify(savedJobs) : undefined;

      await run(`
        UPDATE users SET 
          name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          dob = COALESCE(?, dob),
          gender = COALESCE(?, gender),
          skills = COALESCE(?, skills),
          languages = COALESCE(?, languages),
          resumeName = COALESCE(?, resumeName),
          profilePhoto = COALESCE(?, profilePhoto),
          savedJobs = COALESCE(?, savedJobs)
        WHERE email = ?`,
        [
          name !== undefined ? name : null,
          phone !== undefined ? phone : null,
          address !== undefined ? address : null,
          dob !== undefined ? dob : null,
          gender !== undefined ? gender : null,
          skillsStr !== undefined ? skillsStr : null,
          languagesStr !== undefined ? languagesStr : null,
          finalResumeName !== undefined ? finalResumeName : null,
          profilePhoto !== undefined ? profilePhoto : null,
          savedJobsStr !== undefined ? savedJobsStr : null,
          email
        ]
      );

      if (resumeName && resumeData && finalResumeName) {
        try {
          await run(`UPDATE applications SET resumeName = ? WHERE seekerEmail = ?`, [finalResumeName, email]);
        } catch (appErr) {
          console.error("Failed to update applications resumes:", appErr);
        }
      }
    }
    
    if (user.role === 'employer' || user.role === 'both') {
      const { companyName, logo, industry, website, description, socialMedia, savedJobs } = req.body;
      
      const socialMediaStr = socialMedia ? JSON.stringify(socialMedia) : undefined;
      const savedJobsStr = savedJobs !== undefined ? JSON.stringify(savedJobs) : undefined;

      await run(`
        UPDATE users SET 
          companyName = COALESCE(?, companyName),
          logo = COALESCE(?, logo),
          industry = COALESCE(?, industry),
          website = COALESCE(?, website),
          description = COALESCE(?, description),
          socialMedia = COALESCE(?, socialMedia),
          savedJobs = COALESCE(?, savedJobs)
        WHERE email = ?`,
        [
          companyName !== undefined ? companyName : null,
          logo !== undefined ? logo : null,
          industry !== undefined ? industry : null,
          website !== undefined ? website : null,
          description !== undefined ? description : null,
          socialMediaStr !== undefined ? socialMediaStr : null,
          savedJobsStr !== undefined ? savedJobsStr : null,
          email
        ]
      );
    }

    const updatedUser = await get('SELECT * FROM users WHERE email = ?', [email]);
    res.json(parseUserJSON(updatedUser));
  } catch (error) {
    next(error);
  }
};

// @desc    Verify user email code
// @route   POST /api/auth/verify
// @access  Public
const verifyUser = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.statusCode = 400;
      throw new Error('Please include email and verification code');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('User not found');
    }

    if (user.emailVerified === 1) {
      res.statusCode = 400;
      throw new Error('Account is already verified');
    }

    if (String(user.verificationCode).trim() !== String(code).trim()) {
      res.statusCode = 400;
      throw new Error('Invalid verification code');
    }

    if (parseInt(user.verificationCodeExpires) < Date.now()) {
      res.statusCode = 400;
      throw new Error('Verification code has expired. Please request a new one.');
    }

    // Activate the user
    await run(
      'UPDATE users SET emailVerified = 1, verificationCode = NULL, verificationCodeExpires = NULL WHERE email = ?',
      [normalizedEmail]
    );

    res.status(200).json({
      email: user.email,
      role: user.role,
      token: generateToken(user.email),
      message: 'Email verified successfully. Welcome!'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend verification code
// @route   POST /api/auth/resend-code
// @access  Public
const resendCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.statusCode = 400;
      throw new Error('Please include email address');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('User not found');
    }

    if (user.emailVerified === 1) {
      res.statusCode = 400;
      throw new Error('Account is already verified');
    }

    // Generate new code and expiration
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = (Date.now() + 15 * 60 * 1000).toString();

    await run(
      'UPDATE users SET verificationCode = ?, verificationCodeExpires = ? WHERE email = ?',
      [verificationCode, verificationCodeExpires, normalizedEmail]
    );

    // Send email
    await sendEmail({
      to: email,
      subject: 'Verify Your JobPortal Account',
      text: `Your verification code is ${verificationCode}. It will expire in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4F46E5; margin-top: 0;">Welcome to JobPortal!</h2>
          <p>Please use the new verification code below to complete your sign-up:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 5px; letter-spacing: 5px; margin: 20px 0; color: #1f2937;">
            ${verificationCode}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code will expire in 15 minutes.</p>
        </div>
      `
    });

    res.status(200).json({ message: 'Verification code resent successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Request password reset code
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.statusCode = 400;
      throw new Error('Please provide an email address');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('No user found with this email address');
    }

    // Generate random 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = (Date.now() + 15 * 60 * 1000).toString(); // 15 mins

    // Save reset code and expiry
    await run(
      'UPDATE users SET resetPasswordCode = ?, resetPasswordExpires = ? WHERE email = ?',
      [resetCode, resetExpires, normalizedEmail]
    );

    // Send email
    await sendEmail({
      to: normalizedEmail,
      subject: 'Password Reset Verification Code',
      text: `Your password reset code is ${resetCode}. It will expire in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #78350F; margin-top: 0;">Password Reset Request</h2>
          <p>We received a request to reset your password. Use the verification code below to set a new password:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f7f4eb; padding: 15px; text-align: center; border-radius: 5px; letter-spacing: 5px; margin: 20px 0; color: #78350F;">
            ${resetCode}
          </div>
          <p style="color: #786B65; font-size: 14px;">This code will expire in 15 minutes. If you did not make this request, you can safely ignore this email.</p>
        </div>
      `
    });

    res.status(200).json({ message: 'Password reset code sent successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using verification code
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      res.statusCode = 400;
      throw new Error('Please include email, code, and newPassword');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('No user found with this email address');
    }

    // Verify reset code
    if (!user.resetPasswordCode || String(user.resetPasswordCode).trim() !== String(code).trim()) {
      res.statusCode = 400;
      throw new Error('Invalid verification code');
    }

    // Check expiration
    if (Date.now() > parseInt(user.resetPasswordExpires)) {
      res.statusCode = 400;
      throw new Error('Verification code has expired');
    }

    // Check new password against current password and last 2 passwords
    if (bcrypt.compareSync(newPassword, user.password)) {
      res.statusCode = 400;
      throw new Error('New password cannot be the same as your current password.');
    }

    let history = [];
    try {
      history = JSON.parse(user.passwordHistory || '[]');
    } catch (e) {
      history = [];
    }

    for (const oldHash of history) {
      if (bcrypt.compareSync(newPassword, oldHash)) {
        res.statusCode = 400;
        throw new Error('New password cannot be the same as any of your last 2 passwords.');
      }
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password history: push old password, keep only last 2
    history.push(user.password);
    if (history.length > 2) {
      history = history.slice(-2);
    }
    const historyStr = JSON.stringify(history);

    // Update password, clear reset fields, and save history
    await run(
      'UPDATE users SET password = ?, resetPasswordCode = NULL, resetPasswordExpires = NULL, passwordHistory = ? WHERE email = ?',
      [hashedPassword, historyStr, normalizedEmail]
    );

    res.status(200).json({ message: 'Password reset successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify password reset code (step 1 of 2-step reset)
// @route   POST /api/auth/verify-reset-code
// @access  Public
const verifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.statusCode = 400;
      throw new Error('Please include email and verification code');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!user) {
      res.statusCode = 404;
      throw new Error('No user found with this email address');
    }

    if (!user.resetPasswordCode || String(user.resetPasswordCode).trim() !== String(code).trim()) {
      res.statusCode = 400;
      throw new Error('Invalid verification code');
    }

    if (Date.now() > parseInt(user.resetPasswordExpires)) {
      res.statusCode = 400;
      throw new Error('Verification code has expired');
    }

    res.status(200).json({ message: 'Code verified successfully.', verified: true });
  } catch (error) {
    next(error);
  }
};
// @desc    Update saved jobs list
// @route   PUT /api/auth/saved-jobs
// @access  Private
const updateSavedJobs = async (req, res, next) => {
  try {
    const email = req.user.email;
    const { savedJobs } = req.body;

    if (!Array.isArray(savedJobs)) {
      res.statusCode = 400;
      throw new Error('savedJobs must be an array');
    }

    const savedJobsStr = JSON.stringify(savedJobs);
    await run('UPDATE users SET savedJobs = ? WHERE email = ?', [savedJobsStr, email]);

    const updatedUser = await get('SELECT * FROM users WHERE email = ?', [email]);
    res.json(parseUserJSON(updatedUser));
  } catch (error) {
    next(error);
  }
};
// @desc    Mark all notifications as read
// @route   PUT /api/auth/notifications/read
// @access  Private
const readNotifications = async (req, res, next) => {
  try {
    const email = req.user.email;
    const user = await get('SELECT notifications FROM users WHERE email = ?', [email]);

    if (!user) {
      res.statusCode = 404;
      throw new Error('User not found');
    }

    let notifications = [];
    try { notifications = JSON.parse(user.notifications || '[]'); } catch(e) {}

    const updatedNotifs = notifications.map(n => ({ ...n, read: true }));
    await run('UPDATE users SET notifications = ? WHERE email = ?', [JSON.stringify(updatedNotifs), email]);

    const updatedUser = await get('SELECT * FROM users WHERE email = ?', [email]);
    res.json(parseUserJSON(updatedUser));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  updateSavedJobs,
  readNotifications,
  parseUserJSON,
  verifyUser,
  resendCode,
  forgotPassword,
  verifyResetCode,
  resetPassword
};
