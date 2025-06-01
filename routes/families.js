const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const Family = require('../models/Family');
const User = require('../models/User');

// @route   POST api/families
// @desc    Create a new family
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('name', 'Family name is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name } = req.body;

      // Create new family
      const family = new Family({
        name,
        members: [{ user: req.user.id, role: 'head' }]
      });

      await family.save();
      
      // Populate user information
      const populatedFamily = await Family.findById(family._id)
        .populate('members.user', ['name', 'email', 'avatar']);
      
      res.json(populatedFamily);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/families
// @desc    Get all families user belongs to
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const families = await Family.find({ 'members.user': req.user.id })
      .populate('members.user', ['name', 'email', 'avatar']);
    
    res.json(families);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/families/:id
// @desc    Get specific family details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id)
      .populate('members.user', ['name', 'email', 'avatar']);
    
    if (!family) {
      return res.status(404).json({ msg: 'Family not found' });
    }

    // Check if user is a member of the family
    const isMember = family.members.some(member => 
      member.user._id.toString() === req.user.id
    );

    if (!isMember) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    res.json(family);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/families/join
// @desc    Join family with invite code
// @access  Private
router.post(
  '/join',
  [
    auth,
    [
      check('inviteCode', 'Invite code is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { inviteCode } = req.body;

      // Find family by invite code
      const family = await Family.findOne({ inviteCode });
      
      if (!family) {
        return res.status(404).json({ msg: 'Invalid invite code' });
      }

      // Check if user is already a member
      const isMember = family.members.some(member => 
        member.user.toString() === req.user.id
      );

      if (isMember) {
        return res.status(400).json({ msg: 'You are already a member of this family' });
      }

      // Add user to family members
      family.members.push({ user: req.user.id, role: 'member' });
      family.updatedAt = Date.now();
      
      await family.save();
      
      // Populate user information
      const populatedFamily = await Family.findById(family._id)
        .populate('members.user', ['name', 'email', 'avatar']);
      
      res.json(populatedFamily);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/families/:id/members
// @desc    Get family members
// @access  Private
router.get('/:id/members', auth, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id)
      .populate('members.user', ['name', 'email', 'avatar']);
    
    if (!family) {
      return res.status(404).json({ msg: 'Family not found' });
    }

    // Check if user is a member of the family
    const isMember = family.members.some(member => 
      member.user._id.toString() === req.user.id
    );

    if (!isMember) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    res.json(family.members);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/families/:id/leave
// @desc    Leave a family
// @access  Private
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    
    if (!family) {
      return res.status(404).json({ msg: 'Family not found' });
    }

    // Check if user is a member of the family
    const memberIndex = family.members.findIndex(member => 
      member.user.toString() === req.user.id
    );

    if (memberIndex === -1) {
      return res.status(400).json({ msg: 'You are not a member of this family' });
    }

    // Check if user is the head of family
    const isHead = family.members[memberIndex].role === 'head';
    
    if (isHead && family.members.length > 1) {
      return res.status(400).json({ 
        msg: 'Head of family cannot leave. Transfer ownership to another member first or remove all other members.' 
      });
    }

    // If head is the only member, delete the family
    if (isHead && family.members.length === 1) {
      await Family.findByIdAndDelete(req.params.id);
      return res.json({ msg: 'Family deleted successfully' });
    }

    // Remove user from family members
    family.members.splice(memberIndex, 1);
    family.updatedAt = Date.now();
    
    await family.save();
    
    res.json({ msg: 'Successfully left the family' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/families/:id/transfer-ownership
// @desc    Transfer family ownership to another member
// @access  Private
router.put(
  '/:id/transfer-ownership',
  [
    auth,
    [
      check('newHeadId', 'New head user ID is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { newHeadId } = req.body;
      const family = await Family.findById(req.params.id);
      
      if (!family) {
        return res.status(404).json({ msg: 'Family not found' });
      }

      // Check if user is the head of the family
      const currentHeadIndex = family.members.findIndex(member => 
        member.user.toString() === req.user.id && member.role === 'head'
      );

      if (currentHeadIndex === -1) {
        return res.status(403).json({ msg: 'Only head of family can transfer ownership' });
      }

      // Check if new head is a member of the family
      const newHeadIndex = family.members.findIndex(member => 
        member.user.toString() === newHeadId
      );

      if (newHeadIndex === -1) {
        return res.status(400).json({ msg: 'New head must be a member of the family' });
      }

      // Transfer ownership
      family.members[currentHeadIndex].role = 'member';
      family.members[newHeadIndex].role = 'head';
      family.updatedAt = Date.now();
      
      await family.save();
      
      // Populate user information
      const populatedFamily = await Family.findById(family._id)
        .populate('members.user', ['name', 'email', 'avatar']);
      
      res.json(populatedFamily);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Family not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

module.exports = router;
