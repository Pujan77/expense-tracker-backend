const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const Expense = require('../models/Expense');
const Family = require('../models/Family');
const User = require('../models/User');

// Helper function to check if user is a member of the family
const isFamilyMember = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  return family.members.some(member => member.user.toString() === userId);
};

// @route   POST api/expenses
// @desc    Add new expense
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('familyId', 'Family ID is required').not().isEmpty(),
      check('amount', 'Amount is required and must be a number').isNumeric(),
      check('description', 'Description is required').not().isEmpty(),
      check('category', 'Category is required').not().isEmpty(),
      check('date', 'Date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { familyId, amount, description, category, date, sharedAmongst } = req.body;

      // Check if user is a member of the family
      const memberCheck = await isFamilyMember(req.user.id, familyId);
      if (!memberCheck) {
        return res.status(403).json({ msg: 'Not authorized to add expenses to this family' });
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

      // Create new expense
      const expense = new Expense({
        family: familyId,
        creator: req.user.id,
        amount,
        description,
        category,
        date,
        sharedAmongst: processedSharedAmongst
      });

      await expense.save();
      
      // Populate user information
      const populatedExpense = await Expense.findById(expense._id)
        .populate('creator', ['name', 'email'])
        .populate('sharedAmongst.user', ['name', 'email']);
      
      res.json(populatedExpense);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/expenses/family/:familyId
// @desc    Get all expenses for a family
// @access  Private
router.get('/family/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view expenses for this family' });
    }

    // Get query parameters for filtering
    const { startDate, endDate, category, userId } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (startDate) {
      filter.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.date = { $lte: new Date(endDate) };
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (userId) {
      filter.$or = [
        { creator: userId },
        { 'sharedAmongst.user': userId }
      ];
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1 })
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    res.json(expenses);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/expenses/:id
// @desc    Get specific expense details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    if (!expense) {
      return res.status(404).json({ msg: 'Expense not found' });
    }

    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, expense.family);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view this expense' });
    }

    res.json(expense);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Expense not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/expenses/:id
// @desc    Update expense
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('amount', 'Amount must be a number').optional().isNumeric(),
      check('description', 'Description is required').optional().not().isEmpty(),
      check('category', 'Category is required').optional().not().isEmpty(),
      check('date', 'Date is required').optional().not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const expense = await Expense.findById(req.params.id);
      
      if (!expense) {
        return res.status(404).json({ msg: 'Expense not found' });
      }

      // Check if user is the creator of the expense
      if (expense.creator.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Not authorized to update this expense' });
      }

      const { amount, description, category, date, sharedAmongst } = req.body;

      // Update fields if provided
      if (amount) expense.amount = amount;
      if (description) expense.description = description;
      if (category) expense.category = category;
      if (date) expense.date = date;
      
      // Process shared amongst data if provided
      if (sharedAmongst && Array.isArray(sharedAmongst) && sharedAmongst.length > 0) {
        // Get family members for validation
        const family = await Family.findById(expense.family);
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
          expense.sharedAmongst = sharedAmongst.map(share => ({
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
          expense.sharedAmongst = sharedAmongst;
        } else if (shareType === 'fixed') {
          // Fixed amount sharing - validate total equals expense amount
          const totalFixed = sharedAmongst.reduce((sum, share) => sum + (share.shareValue || 0), 0);
          if (Math.abs(totalFixed - (amount || expense.amount)) > 0.01) {
            return res.status(400).json({ msg: 'Fixed shares must total to expense amount' });
          }
          expense.sharedAmongst = sharedAmongst;
        }
      }

      expense.updatedAt = Date.now();
      await expense.save();
      
      // Populate user information
      const populatedExpense = await Expense.findById(expense._id)
        .populate('creator', ['name', 'email'])
        .populate('sharedAmongst.user', ['name', 'email']);
      
      res.json(populatedExpense);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Expense not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ msg: 'Expense not found' });
    }

    // Check if user is the creator of the expense
    if (expense.creator.toString() !== req.user.id) {
      // Check if user is the head of the family
      const family = await Family.findById(expense.family);
      const isHead = family.members.some(member => 
        member.user.toString() === req.user.id && member.role === 'head'
      );
      
      if (!isHead) {
        return res.status(403).json({ msg: 'Not authorized to delete this expense' });
      }
    }

    await Expense.findByIdAndDelete(req.params.id);
    
    res.json({ msg: 'Expense deleted successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Expense not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/expenses/summary/:familyId
// @desc    Get expense summary for a family
// @access  Private
router.get('/summary/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view expenses for this family' });
    }

    // Get query parameters for filtering
    const { startDate, endDate } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (startDate) {
      filter.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.date = { $lte: new Date(endDate) };
    }

    // Get total expenses
    const totalExpenses = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    // Get expenses by category
    const expensesByCategory = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } }
    ]);

    // Get expenses by user
    const expensesByUser = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: "$creator", total: { $sum: "$amount" } } }
    ]);

    // Populate user information for expenses by user
    const populatedExpensesByUser = await User.populate(expensesByUser, {
      path: '_id',
      select: 'name email'
    });

    // Get expenses by month (if date range spans multiple months)
    let expensesByMonth = [];
    if (startDate && endDate) {
      expensesByMonth = await Expense.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            total: { $sum: "$amount" }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    }

    res.json({
      totalAmount: totalExpenses.length > 0 ? totalExpenses[0].total : 0,
      byCategory: expensesByCategory,
      byUser: populatedExpensesByUser,
      byMonth: expensesByMonth
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
