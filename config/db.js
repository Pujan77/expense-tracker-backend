const mongoose = require('mongoose');
const config = require('config');
const mongoURI = config.get('mongoURI');

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;
