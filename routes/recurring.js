const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const RecurringExpense = require('../models/RecurringExpense');
const Family = require('../models/Family');
const Expense = require('../models/Expense');

// Helper function to check if user is a member of the family
const isFamilyMember = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  return family.members.some(member => member.user.toString() === userId);
};

// @route   POST api/recurring
// @desc    Create a new recurring expense
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('familyId', 'Family ID is required').not().isEmpty(),
      check('title', 'Title is required').not().isEmpty(),
      check('amount', 'Amount is required and must be a number').isNumeric(),
      check('category', 'Category is required').not().isEmpty(),
      check('frequency', 'Frequency is required').isIn(['daily', 'weekly', 'monthly', 'yearly']),
      check('startDate', 'Start date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { 
        familyId, 
        title, 
        amount, 
        description, 
        category, 
        frequency, 
        startDate, 
        endDate,
        dayOfMonth,
        dayOfWeek,
        sharedAmongst 
      } = req.body;

      // Check if user is a member of the family
      const memberCheck = await isFamilyMember(req.user.id, familyId);
      if (!memberCheck) {
        return res.status(403).json({ msg: 'Not authorized to create recurring expenses for this family' });
      }

      // Get family members for validation and default sharing
      const family = await Family.findById(familyId);
      const familyMemberIds = family.members.map(member => member.user.toString());

      // Process shared amongst data
      let processedSharedAmongst = [];
      
      // If sharedAmongst is provided, validate and process it
      if (sharedAmongst && Array.isArray(sharedAmongst) && sharedAmongst.length > 0) {
        // Validate all users are family members
        const allValidUsers = sharedAmongst.every(share => 
          familyMemberIds.includes(share.user.toString())
        );
        
        if (!allValidUsers) {
          return res.status(400).json({ msg: 'All shared users must be family members' });
        }
        
        // Process based on share type
        const shareType = sharedAmongst[0].shareType || 'equal';
        
        if (shareType === 'equal') {
          // Equal sharing
          const shareValue = 1 / sharedAmongst.length;
          processedSharedAmongst = sharedAmongst.map(share => ({
            user: share.user,
            shareType: 'equal',
            shareValue: shareValue
          }));
        } else if (shareType === 'percentage') {
          // Percentage sharing - validate total is 100%
          const totalPercentage = sharedAmongst.reduce((sum, share) => sum + (share.shareValue || 0), 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            return res.status(400).json({ msg: 'Percentage shares must total 100%' });
          }
          processedSharedAmongst = sharedAmongst;
        } else if (shareType === 'fixed') {
          // Fixed amount sharing - validate total equals expense amount
          const totalFixed = sharedAmongst.reduce((sum, share) => sum + (share.shareValue || 0), 0);
          if (Math.abs(totalFixed - amount) > 0.01) {
            return res.status(400).json({ msg: 'Fixed shares must total to expense amount' });
          }
          processedSharedAmongst = sharedAmongst;
        }
      } else {
        // Default to equal sharing among all family members
        const shareValue = 1 / family.members.length;
        processedSharedAmongst = family.members.map(member => ({
          user: member.user,
          shareType: 'equal',
          shareValue: shareValue
        }));
      }

      // Create new recurring expense
      const recurringExpense = new RecurringExpense({
        family: familyId,
        creator: req.user.id,
        title,
        amount,
        description,
        category,
        frequency,
        startDate,
        endDate,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        sharedAmongst: processedSharedAmongst
      });

      await recurringExpense.save();
      
      // Populate user information
      const populatedRecurringExpense = await RecurringExpense.findById(recurringExpense._id)
        .populate('creator', ['name', 'email'])
        .populate('sharedAmongst.user', ['name', 'email']);
      
      res.json(populatedRecurringExpense);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/recurring/family/:familyId
// @desc    Get all recurring expenses for a family
// @access  Private
router.get('/family/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view recurring expenses for this family' });
    }

    // Get query parameters for filtering
    const { active } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (active === 'true') {
      filter.isActive = true;
    } else if (active === 'false') {
      filter.isActive = false;
    }

    const recurringExpenses = await RecurringExpense.find(filter)
      .sort({ createdAt: -1 })
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    res.json(recurringExpenses);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/recurring/:id
// @desc    Get specific recurring expense details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const recurringExpense = await RecurringExpense.findById(req.params.id)
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    if (!recurringExpense) {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }

    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, recurringExpense.family);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view this recurring expense' });
    }

    res.json(recurringExpense);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/recurring/:id
// @desc    Update recurring expense
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('title', 'Title is required').optional().not().isEmpty(),
      check('amount', 'Amount must be a number').optional().isNumeric(),
      check('frequency', 'Frequency must be valid').optional().isIn(['daily', 'weekly', 'monthly', 'yearly'])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const recurringExpense = await RecurringExpense.findById(req.params.id);
      
      if (!recurringExpense) {
        return res.status(404).json({ msg: 'Recurring expense not found' });
      }

      // Check if user is the creator of the recurring expense
      if (recurringExpense.creator.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Not authorized to update this recurring expense' });
      }

      const { 
        title, 
        amount, 
        description, 
        category, 
        frequency, 
        startDate, 
        endDate,
        dayOfMonth,
        dayOfWeek,
        isActive,
        sharedAmongst 
      } = req.body;

      // Update fields if provided
      if (title) recurringExpense.title = title;
      if (amount) recurringExpense.amount = amount;
      if (description !== undefined) recurringExpense.description = description;
      if (category) recurringExpense.category = category;
      if (frequency) recurringExpense.frequency = frequency;
      if (startDate) recurringExpense.startDate = startDate;
      if (endDate !== undefined) recurringExpense.endDate = endDate;
      if (isActive !== undefined) recurringExpense.isActive = isActive;
      
      // Update frequency-specific fields
      if (frequency === 'monthly' && dayOfMonth) {
        recurringExpense.dayOfMonth = dayOfMonth;
        recurringExpense.dayOfWeek = undefined;
      } else if (frequency === 'weekly' && dayOfWeek !== undefined) {
        recurringExpense.dayOfWeek = dayOfWeek;
        recurringExpense.dayOfMonth = undefined;
      }
      
      // Process shared amongst data if provided
      if (sharedAmongst && Array.isArray(sharedAmongst) && sharedAmongst.length > 0) {
        // Get family members for validation
        const family = await Family.findById(recurringExpense.family);
        const familyMemberIds = family.members.map(member => member.user.toString());

        // Validate all users are family members
        const allValidUsers = sharedAmongst.every(share => 
          familyMemberIds.includes(share.user.toString())
        );
        
        if (!allValidUsers) {
          return res.status(400).json({ msg: 'All shared users must be family members' });
        }
        
        // Process based on share type
        const shareType = sharedAmongst[0].shareType || 'equal';
        
        if (shareType === 'equal') {
          // Equal sharing
          const shareValue = 1 / sharedAmongst.length;
          recurringExpense.sharedAmongst = sharedAmongst.map(share => ({
            user: share.user,
            shareType: 'equal',
            shareValue: shareValue
          }));
        } else if (shareType === 'percentage') {
          // Percentage sharing - validate total is 100%
          const totalPercentage = sharedAmongst.reduce((sum, share) => sum + (share.shareValue || 0), 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            return res.status(400).json({ msg: 'Percentage shares must total 100%' });
          }
          recurringExpense.sharedAmongst = sharedAmongst;
        } else if (shareType === 'fixed') {
          // Fixed amount sharing - validate total equals expense amount
          const totalFixed = sharedAmongst.reduce((sum, share) => sum + (share.shareValue || 0), 0);
          if (Math.abs(totalFixed - (amount || recurringExpense.amount)) > 0.01) {
            return res.status(400).json({ msg: 'Fixed shares must total to expense amount' });
          }
          recurringExpense.sharedAmongst = sharedAmongst;
        }
      }

      recurringExpense.updatedAt = Date.now();
      await recurringExpense.save();
      
      // Populate user information
      const populatedRecurringExpense = await RecurringExpense.findById(recurringExpense._id)
        .populate('creator', ['name', 'email'])
        .populate('sharedAmongst.user', ['name', 'email']);
      
      res.json(populatedRecurringExpense);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Recurring expense not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE api/recurring/:id
// @desc    Delete recurring expense
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const recurringExpense = await RecurringExpense.findById(req.params.id);
    
    if (!recurringExpense) {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }

    // Check if user is the creator of the recurring expense
    if (recurringExpense.creator.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized to delete this recurring expense' });
    }

    await RecurringExpense.findByIdAndDelete(req.params.id);
    
    res.json({ msg: 'Recurring expense deleted successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/recurring/:id/generate
// @desc    Generate actual expense from recurring expense
// @access  Private
router.post('/:id/generate', auth, async (req, res) => {
  try {
    const recurringExpense = await RecurringExpense.findById(req.params.id)
      .populate('sharedAmongst.user');
    
    if (!recurringExpense) {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }

    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, recurringExpense.family);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to generate expense for this family' });
    }

    // Check if recurring expense is active
    if (!recurringExpense.isActive) {
      return res.status(400).json({ msg: 'Cannot generate expense from inactive recurring expense' });
    }

    // Create new expense from recurring expense
    const expense = new Expense({
      family: recurringExpense.family,
      creator: req.user.id,
      amount: recurringExpense.amount,
      description: `[Recurring] ${recurringExpense.title}${recurringExpense.description ? ': ' + recurringExpense.description : ''}`,
      category: recurringExpense.category,
      date: new Date(),
      sharedAmongst: recurringExpense.sharedAmongst
    });

    await expense.save();
    
    // Update last generated date
    recurringExpense.lastGeneratedDate = new Date();
    await recurringExpense.save();
    
    // Populate user information
    const populatedExpense = await Expense.findById(expense._id)
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    res.json(populatedExpense);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Recurring expense not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
