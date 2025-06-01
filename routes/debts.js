const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const Debt = require('../models/Debt');
const Family = require('../models/Family');
const Expense = require('../models/Expense');
const User = require('../models/User');
const debtCalculator = require('../utils/debtCalculator');

// Helper function to check if user is the head of the family
const isFamilyHead = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  const headMember = family.members.find(member => 
    member.role === 'head' && member.user.toString() === userId
  );
  
  return !!headMember;
};

// Helper function to check if user is a member of the family
const isFamilyMember = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  return family.members.some(member => member.user.toString() === userId);
};

// @route   GET api/debts/current/:familyId
// @desc    Get current debts for a family
// @access  Private
router.get('/current/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view debts for this family' });
    }

    // Get query parameters for filtering
    const { startDate, endDate } = req.query;
    
    // Build filter object for expenses
    const filter = { family: familyId };
    
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (startDate) {
      filter.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.date = { $lte: new Date(endDate) };
    }

    // Check if there's a finalized debt for this period
    let finalizedDebt = null;
    if (startDate && endDate) {
      finalizedDebt = await Debt.findOne({
        family: familyId,
        isFinalized: true,
        'period.startDate': { $lte: new Date(endDate) },
        'period.endDate': { $gte: new Date(startDate) }
      });
    }

    if (finalizedDebt) {
      return res.status(400).json({ 
        msg: 'This period has already been finalized',
        finalizedDebtId: finalizedDebt._id
      });
    }

    // Get all expenses for the family in the given period
    const expenses = await Expense.find(filter);
    
    if (expenses.length === 0) {
      return res.json({ debts: [] });
    }

    // Calculate raw debts
    const rawDebts = debtCalculator.calculateRawDebts(expenses);
    
    // Simplify debts
    const simplifiedDebts = debtCalculator.simplifyDebts(rawDebts);
    
    // Populate user information
    const populatedDebts = await Promise.all(simplifiedDebts.map(async (debt) => {
      const fromUser = await User.findById(debt.from).select('name email avatar');
      const toUser = await User.findById(debt.to).select('name email avatar');
      
      return {
        from: {
          _id: fromUser._id,
          name: fromUser.name,
          email: fromUser.email,
          avatar: fromUser.avatar
        },
        to: {
          _id: toUser._id,
          name: toUser.name,
          email: toUser.email,
          avatar: toUser.avatar
        },
        amount: debt.amount
      };
    }));
    
    res.json({ 
      period: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      debts: populatedDebts
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/debts/calculate/:familyId
// @desc    Calculate and simplify debts for a family
// @access  Private
router.post(
  '/calculate/:familyId',
  [
    auth,
    [
      check('startDate', 'Start date is required').not().isEmpty(),
      check('endDate', 'End date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { familyId } = req.params;
      const { startDate, endDate } = req.body;
      
      // Check if user is a member of the family
      const memberCheck = await isFamilyMember(req.user.id, familyId);
      if (!memberCheck) {
        return res.status(403).json({ msg: 'Not authorized to calculate debts for this family' });
      }

      // Check if there's a finalized debt for this period
      const finalizedDebt = await Debt.findOne({
        family: familyId,
        isFinalized: true,
        'period.startDate': { $lte: new Date(endDate) },
        'period.endDate': { $gte: new Date(startDate) }
      });

      if (finalizedDebt) {
        return res.status(400).json({ 
          msg: 'This period has already been finalized',
          finalizedDebtId: finalizedDebt._id
        });
      }

      // Get all expenses for the family in the given period
      const expenses = await Expense.find({
        family: familyId,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      });
      
      if (expenses.length === 0) {
        return res.status(400).json({ msg: 'No expenses found for the given period' });
      }

      // Calculate raw debts
      const rawDebts = debtCalculator.calculateRawDebts(expenses);
      
      // Simplify debts
      const simplifiedDebts = debtCalculator.simplifyDebts(rawDebts);
      
      // Create new debt record
      const debt = new Debt({
        family: familyId,
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        debts: simplifiedDebts
      });

      await debt.save();
      
      // Populate user information
      const populatedDebt = await Debt.findById(debt._id)
        .populate('debts.from', ['name', 'email', 'avatar'])
        .populate('debts.to', ['name', 'email', 'avatar']);
      
      res.json(populatedDebt);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Family not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   POST api/debts/settle/:debtId
// @desc    Settle specific debt
// @access  Private
router.post(
  '/settle/:debtId',
  [
    auth,
    [
      check('debtIndex', 'Debt index is required').isNumeric()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { debtId } = req.params;
      const { debtIndex } = req.body;
      
      const debt = await Debt.findById(debtId);
      
      if (!debt) {
        return res.status(404).json({ msg: 'Debt record not found' });
      }

      // Check if user is the head of the family
      const headCheck = await isFamilyHead(req.user.id, debt.family);
      if (!headCheck) {
        return res.status(403).json({ msg: 'Only head of family can settle debts' });
      }

      // Check if debt is already finalized
      if (debt.isFinalized) {
        return res.status(400).json({ msg: 'This debt record is already finalized' });
      }

      // Check if debt index is valid
      if (debtIndex < 0 || debtIndex >= debt.debts.length) {
        return res.status(400).json({ msg: 'Invalid debt index' });
      }

      // Check if debt is already settled
      if (debt.debts[debtIndex].settled) {
        return res.status(400).json({ msg: 'This debt is already settled' });
      }

      // Mark debt as settled
      debt.debts[debtIndex].settled = true;
      debt.debts[debtIndex].settledAt = Date.now();
      debt.updatedAt = Date.now();
      
      await debt.save();
      
      // Populate user information
      const populatedDebt = await Debt.findById(debt._id)
        .populate('debts.from', ['name', 'email', 'avatar'])
        .populate('debts.to', ['name', 'email', 'avatar']);
      
      res.json(populatedDebt);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Debt record not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   POST api/debts/finalize/:debtId
// @desc    Finalize debts for period
// @access  Private
router.post('/finalize/:debtId', auth, async (req, res) => {
  try {
    const { debtId } = req.params;
    
    const debt = await Debt.findById(debtId);
    
    if (!debt) {
      return res.status(404).json({ msg: 'Debt record not found' });
    }

    // Check if user is the head of the family
    const headCheck = await isFamilyHead(req.user.id, debt.family);
    if (!headCheck) {
      return res.status(403).json({ msg: 'Only head of family can finalize debts' });
    }

    // Check if debt is already finalized
    if (debt.isFinalized) {
      return res.status(400).json({ msg: 'This debt record is already finalized' });
    }

    // Check if all debts are settled
    const allSettled = debt.debts.every(d => d.settled);
    if (!allSettled) {
      return res.status(400).json({ msg: 'All debts must be settled before finalizing' });
    }

    // Mark as finalized
    debt.isFinalized = true;
    debt.finalizedAt = Date.now();
    debt.updatedAt = Date.now();
    
    await debt.save();
    
    // Populate user information
    const populatedDebt = await Debt.findById(debt._id)
      .populate('debts.from', ['name', 'email', 'avatar'])
      .populate('debts.to', ['name', 'email', 'avatar']);
    
    res.json(populatedDebt);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Debt record not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/debts/history/:familyId
// @desc    Get debt history for a family
// @access  Private
router.get('/history/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view debt history for this family' });
    }

    // Get query parameters for filtering
    const { startDate, endDate, finalized } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (startDate && endDate) {
      filter['period.startDate'] = { $gte: new Date(startDate) };
      filter['period.endDate'] = { $lte: new Date(endDate) };
    } else if (startDate) {
      filter['period.startDate'] = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter['period.endDate'] = { $lte: new Date(endDate) };
    }
    
    if (finalized === 'true') {
      filter.isFinalized = true;
    } else if (finalized === 'false') {
      filter.isFinalized = false;
    }

    const debts = await Debt.find(filter)
      .sort({ 'period.startDate': -1 })
      .populate('debts.from', ['name', 'email', 'avatar'])
      .populate('debts.to', ['name', 'email', 'avatar']);
    
    res.json(debts);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
