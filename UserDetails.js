const mongoose = require('mongoose');
const bookingSchema = require('./Booking');
const notificationSchema = require('./Notification');

const UserDetailSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  phoneCountryCallingCode: { type: String },
  phoneNo: { type: String, unique: true },
  gender: { type: String, required: true },
  birthday: { type: String, required: true },
  photoUrl: { type: String },
  password: { type: String },
  memberStatus: { type: String, enum: ['guest', 'pending', 'verified', 'rejected'], default: 'guest' },
  bookings: [bookingSchema],
  instagram_id: { type: String },
  referrals: [{
    senderEmail: String,
    senderName: String,
    senderPhoneNumber: String,
    receiverEmail: String,
    receiverPhoneNumber: String,
    referralAccepted: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  }],
  referralRequests: [{
    referralId: mongoose.Schema.Types.ObjectId, // Store the ObjectId of the sender's referral
    senderEmail: String,
    senderName: String,
    senderPhoneNumber: String,
    isActive: { type: Boolean, default: true } // Add the isActive field with default value true
  }],
  notifications: [notificationSchema],
}, {
  collection: "Userinfo"
});

module.exports = mongoose.model('Userinfo', UserDetailSchema);
