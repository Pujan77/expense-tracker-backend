const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RecurringExpenseSchema = new Schema({
  family: {
    type: Schema.Types.ObjectId,
    ref: 'family',
    required: true
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    required: true
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  dayOfMonth: {
    type: Number,
    min: 1,
    max: 31
  },
  dayOfWeek: {
    type: Number,
    min: 0,
    max: 6
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sharedAmongst: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'user'
      },
      shareType: {
        type: String,
        enum: ['equal', 'percentage', 'fixed'],
        default: 'equal'
      },
      shareValue: {
        type: Number,
        default: 0
      }
    }
  ],
  lastGeneratedDate: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('recurringExpense', RecurringExpenseSchema);
