const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Schema = mongoose.Schema;

const FamilySchema = new Schema({
  name: {
    type: String,
    required: true
  },
  inviteCode: {
    type: String,
    default: uuidv4,
    unique: true
  },
  members: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'user'
      },
      role: {
        type: String,
        enum: ['head', 'member'],
        default: 'member'
      },
      joinedAt: {
        type: Date,
        default: Date.now
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

module.exports = mongoose.model('family', FamilySchema);
