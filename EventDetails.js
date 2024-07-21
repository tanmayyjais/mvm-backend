const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  imageUrl: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ['past', 'saved', 'published'],
    default: 'saved',
    required: true,
  },
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
