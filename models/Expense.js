const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExpenseSchema = new Schema({
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
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('expense', ExpenseSchema);
