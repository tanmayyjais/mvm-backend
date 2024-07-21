const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  id: { type: String, required: true},  
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  dateOfBooking: { type: Date, required: true },
  numberOfTickets: { type: Number, required: true },
  isCheckedIn: { type: Boolean, required: true},
  pricePerTicket: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  paymentId: { type: String, required: true }, // Add paymentId to the booking schema
  qrCodeUrl: { type: String, required: true },
});

module.exports = bookingSchema;
