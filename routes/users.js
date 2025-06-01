const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const User = require('../models/User');

// @route   GET api/users/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/users/me
// @desc    Update user profile
// @access  Private
router.put(
  '/me',
  [
    auth,
    [
      check('name', 'Name is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, avatar } = req.body;

    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      // Update fields
      user.name = name;
      if (avatar) user.avatar = avatar;

      await user.save();
      
      // Return updated user without password
      const updatedUser = await User.findById(req.user.id).select('-password');
      res.json(updatedUser);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   PUT api/users/password
// @desc    Change user password
// @access  Private
router.put(
  '/password',
  [
    auth,
    [
      check('currentPassword', 'Current password is required').exists(),
      check('newPassword', 'Please enter a new password with 6 or more characters').isLength({ min: 6 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      // Check current password
      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Current password is incorrect' }] });
      }

      // Encrypt new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);

      await user.save();
      
      res.json({ msg: 'Password updated successfully' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

module.exports = router;
