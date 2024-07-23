require('dotenv').config();
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const serviceAccount = require('./serviceAccountKey.json');
const stripe = require('stripe')('sk_test_51PaZFCG4jx4XRMznPYBP4nQqC2Ie7BzeiTXipJ57IMrrakm07k4t7xiXi0GQebkpceAYXqAuo7e6FcsjEV6i7lQZ00jvZuAQfp');
const qrcode = require('qrcode');

app.use(express.json());
const cors = require("cors");
app.use(cors());

const mongoUrl = process.env.MONGO_URL;
const JWT_SECRET = process.env.JWT_SECRET;

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

mongoose.connect(mongoUrl).then(() => {
    console.log("Database Connected");
}).catch((e) => {
    console.log(e);
});

require('./UserDetails');
const User = mongoose.model("Userinfo");

require('./EventDetails');
const Event = mongoose.model("Event");

require('./ExclusiveEventDetails');
const ExclusiveEvent = mongoose.model("ExclusiveEvent");

require('./Carousel');
const Carousel = mongoose.model("Carousel");

const changeStream = User.watch();

changeStream.on('change', (change) => {
    console.log('Change detected:', change); // Log change details
    if (change.operationType === 'insert' && change.fullDocument) {
        const notification = change.fullDocument;
        console.log(`Emitting event for user ${notification.userId}`); // Log emit details
        io.emit(`notification-update-${notification.userId}`, notification.message);
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});


app.get("/", (req, res) => {
    res.send({ status: "I love you Miss Pretty Riddhi Heda.🥰" });
});

app.post("/userregister", async (req, res) => {
    const { firstName, lastName, email, gender, birthday, password, phoneCountryCallingCode, phoneNo, photoUrl } = req.body;

    if (!firstName || !lastName || !email || !gender || !birthday || !password) {
        return res.status(400).send({ status: "error", data: "All fields are required" });
    }

    const oldUser = await User.findOne({ email: email });
    if (oldUser) {
        return res.status(409).send({ status: "error", data: "User already exists" });
    }

    const encryptedPassword = await bcrypt.hash(password, 10);
    try {
        await User.create({
            firstName,
            lastName,
            email,
            gender,
            birthday,
            password: encryptedPassword,
            phoneCountryCallingCode,
            phoneNo,
            photoUrl,
            memberStatus: 'guest',
            instagram_id: null,
            referrals: [],
            referralRequests: [],
            bookings: [],
            notifications: [] // Initialize empty notifications array
        });

        res.send({ status: "ok", data: "User Created" });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send({ status: "error", data: error.message });
    }
});

app.post("/checkUser", async (req, res) => {
    const { email } = req.body;
    const oldUser = await User.findOne({ email: email });
    if (oldUser) {
      return res.status(200).send({ status: "exists", data: oldUser });
    }
    return res.status(200).send({ status: "not_found", data: "User does not exist" });
  });
  
  app.post("/userlogin", async (req, res) => {
    const { identifier, password } = req.body;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const oldUser = await User.findOne(isEmail ? { email: identifier } : { phoneNo: identifier });
    if (!oldUser) {
      return res.status(404).send({ status: "not_found", data: "User doesn't exist" });
    }
    if (await bcrypt.compare(password, oldUser.password)) {
      const token = jwt.sign({ email: oldUser.email }, JWT_SECRET);
      const userDetails = {
        firstName: oldUser.firstName,
        lastName: oldUser.lastName,
        email: oldUser.email,
        phoneCountryCallingCode: oldUser.phoneCountryCallingCode,
        phoneNo: oldUser.phoneNo,
        gender: oldUser.gender,
        birthday: oldUser.birthday,
        photoUrl: oldUser.photoUrl,
        memberStatus: oldUser.memberStatus,
        instagram_id: oldUser.instagram_id,
        referrals: oldUser.referrals,
        referralRequests: oldUser.referralRequests,
        bookings: oldUser.bookings,
        notifications: oldUser.notifications,
      };
      return res.status(200).send({
        status: "ok",
        data: token,
        userDetails: userDetails,
      });
    } else {
      return res.status(401).send({ status: "unauthorized", data: "Invalid password" });
    }
  });
  

app.post("/verify", async (req, res) => {
    const { token, Email } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const { phone_number: phoneNo } = decodedToken;
        const phoneNumber = parsePhoneNumberFromString(phoneNo);
        if (!phoneNumber) {
            return res.status(400).send({ status: "error", data: "Invalid phone number format" });
        }

        const user = await User.findOne({ email: Email });
        if (!user) {
            console.log("User not found for email:", Email);
            return res.status(404).send({ status: "not_found", data: "User not found" });
        }

        user.phoneCountryCallingCode = phoneNumber.countryCallingCode;
        user.phoneNo = phoneNumber.nationalNumber;
        await user.save();

        const sessionToken = jwt.sign({ email: user.email }, JWT_SECRET);
        res.send({ status: "ok", userDetails: user, sessionToken });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).send({ status: "error", data: "Failed to verify OTP" });
    }
});

app.post("/requestPasswordResetOtp", async (req, res) => {
    const { phoneCountryCallingCode, phoneNumber } = req.body;
    try {
        const user = await User.findOne({ phoneNo: phoneNumber });
        if (!user) {
            return res.status(404).send({ status: "error", data: "user doesn't exist" });
        }

        const confirmation = await auth().signInWithPhoneNumber(`+${phoneCountryCallingCode}${phoneNumber}`);
        res.send({ status: "ok", data: { confirmation } });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).send({ status: "error", data: "Failed to send OTP" });
    }
});

app.post("/resetPasswordWithOtp", async (req, res) => {
    const { phoneNumber, newPassword } = req.body;
    try {
        const user = await User.findOne({ phoneNo: phoneNumber });
        if (!user) {
            return res.status(404).send({ status: "error", data: "user doesn't exist" });
        }

        const encryptedPassword = await bcrypt.hash(newPassword, 10);
        user.password = encryptedPassword;
        await user.save();

        res.send({ status: "ok", data: "Password reset successfully" });
    } catch (error) {
        res.status(500).send({ status: "error", data: "Failed to reset password" });
    }
});

// Event routes
app.post("/createevent", async (req, res) => {
    const { city, name, date, startTime, description, address, price, imageUrl } = req.body;
    console.log(req.body);

    try {
        const newEvent = await Event.create({
            city,
            name,
            date,
            startTime,
            description,
            address,
            price,
            imageUrl,
        });

        res.send({ status: "ok", data: newEvent });
    } catch (error) {
        res.send({ status: "error", data: error.message });
    }
});

app.get("/events", async (req, res) => {
    try {
        const events = await Event.find();
        res.send({ status: "ok", data: events });
    } catch (error) {
        res.send({ status: "error", data: error.message });
    }
});

app.get("/exclusiveevents", async (req, res) => {
    try {
        const exclusiveevents = await ExclusiveEvent.find();
        res.send({ status: "ok", data: exclusiveevents });
    } catch (error) {
        res.send({ status: "error", data: error.message });
    }
});

// Carousel images route
app.get("/carousel-images", async (req, res) => {
    try {
        const carouselImages = await Carousel.find();
        res.send({ status: 'ok', data: carouselImages });
      } catch (error) {
        res.send({ status: 'error', message: error.message });
      }
});

app.post('/update-instagram-id', async (req, res) => {
    const { email, instagramId } = req.body;
  
    try {
      const oldUser = await User.findOne({ email: email });
  
      if (!oldUser) {
        return res.status(404).send({ status: 'error', message: "User doesn't exist!" });
      }
  
      oldUser.instagram_id = instagramId;
      await oldUser.save();
  
      res.send({ status: 'ok', data: 'Instagram ID updated' });
    } catch (error) {
      res.status(500).send({ status: 'error', message: error.message });
    }
  });  

app.post("/update-referrals", async (req, res) => {
    const { email, referrals } = req.body;

    try {
        const oldUser = await User.findOne({ email: email });
        if (!oldUser) {
            return res.status(404).send({ status: "error", data: "User not found" });
        }

        oldUser.referrals = referrals;
        oldUser.memberStatus = 'pending'; // Update member status to pending
        await oldUser.save();

        res.send({ status: "ok", data: "Referrals and member status updated" });
    } catch (error) {
        console.error('Error updating referrals:', error);
        res.status(500).send({ status: "error", data: error.message });
    }
});

app.post("/update-member-status", async (req, res) => {
    const { email, memberStatus } = req.body;

    try {
        const oldUser = await User.findOne({ email: email });
        if (!oldUser) {
            return res.status(404).send({ status: "error", data: "User not found" });
        }

        oldUser.memberStatus = memberStatus;
        await oldUser.save();

        res.send({ status: "ok", data: "Member status updated" });
    } catch (error) {
        res.status(500).send({ status: "error", data: error.message });
    }
});

// Get notifications for a user
app.get('/notifications/:userId', async (req, res) => {
  try {
      const user = await User.findById(req.params.userId).populate('notifications');
      res.json({ notifications: user.notifications });
  } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notifications as read
app.post('/notifications/mark-read', async (req, res) => {
  try {
      const { userId, notificationIds } = req.body;
      await User.updateOne(
          { _id: userId, 'notifications._id': { $in: notificationIds } },
          { $set: { 'notifications.$[elem].read': true } },
          { arrayFilters: [{ 'elem._id': { $in: notificationIds } }] }
      );
      const user = await User.findById(userId).populate('notifications');
      res.json({ notifications: user.notifications });
  } catch (error) {
      res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

const generateUniqueId = async () => {
    let uniqueId;
    let isUnique = false;
  
    while (!isUnique) {
      uniqueId = Math.floor(Math.random() * 900000000000) + 100000000000; // Generate a 12-digit number
      const existingBooking = await User.findOne({ 'bookings.id': uniqueId });
      if (!existingBooking) {
        isUnique = true;
      }
    }
  
    return uniqueId;
};
  
app.post('/payment-sheet', async (req, res) => {
  try {
    const { totalAmount, email } = req.body; // Accept totalAmount from the request body
    const customer = await stripe.customers.create();
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2024-06-20' }
    );
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // Convert amount to pence
      currency: 'gbp',
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: 'pk_test_51PaZFCG4jx4XRMznyfe2jWrqYuUD3wcZJs2gCcmveQ2HWkrw8KNMWycTnt4szxJwLAE2zNn3yZhrZ6nYKkVfL1ND00OmkDALFY',
    });
  } catch (error) {
    console.error('Error in /payment-sheet:', error.message);
    res.status(500).json({ error: error.message });
  }
});
  
app.post('/update-booking', async (req, res) => {
    try {
      const { email, event, ticketCount, paymentId } = req.body;
      console.log('Received data:', { email, event, ticketCount, paymentId });
  
      // Validate email
      const user = await User.findOne({ email });
      if (!user) {
        console.error('User not found:', email);
        throw new Error('User not found');
      }
  
      const totalAmount = event.price * ticketCount;
      console.log('Calculated total amount:', totalAmount);
  
      const bookingId = await generateUniqueId();
  
      const booking = {
        id: bookingId,
        event: event._id,
        dateOfBooking: new Date(),
        numberOfTickets: ticketCount,
        isCheckedIn: false,
        pricePerTicket: event.price,
        totalAmount: totalAmount,
        paymentId: paymentId
      };
  
      console.log('Booking object:', booking);

      const qrCodeData = bookingId.toString(); // QR code data is just the booking ID
      const qrCodeUrl = await qrcode.toDataURL(qrCodeData);
      booking.qrCodeUrl = qrCodeUrl;
  
      const result = await User.updateOne(
        { email },
        { $push: { bookings: booking } }
      );
  
      console.log('Update result:', result);
  
      if (result.nModified === 0) {
        console.error('No changes made for user:', email);
        throw new Error('User not found or no changes made');
      }
  
      const updatedUser = await User.findOne({ email }).populate('bookings.event');
  
      res.json({ message: 'Booking updated successfully', bookings: updatedUser.bookings });
    } catch (error) {
      console.error('Error in /update-booking:', error.message);
      res.status(500).json({ error: error.message });
    }
});

app.get('/get-user-details', async (req, res) => {
  try {
    const guests = await User.find({}, 'phoneNo memberStatus'); // Only select the fields needed
    res.send(guests);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).send({ status: 'error', message: 'Failed to fetch user details' });
  }
});

app.post('/send-referral-request', async (req, res) => {
  const { senderEmail, senderName, senderPhoneNumber, receiverPhoneNumber } = req.body;
  const normalizedReceiverPhoneNumber = receiverPhoneNumber.replace(/\D/g, '').slice(-10);

  try {
    const receiver = await User.findOne({ phoneNo: normalizedReceiverPhoneNumber });
    if (!receiver) {
      return res.status(404).send({ status: 'error', message: "Receiver doesn't exist!" });
    }

    const referral = {
      senderEmail,
      senderName,
      senderPhoneNumber,
      receiverEmail: receiver.email,
      receiverPhoneNumber: normalizedReceiverPhoneNumber,
      referralAccepted: 'pending',
    };

    // Add referral to sender's document
    const sender = await User.findOne({ email: senderEmail });
    if (!sender) {
      return res.status(404).send({ status: 'error', message: "Sender doesn't exist!" });
    }
    sender.referrals.push(referral);
    await sender.save();

    // Add referral request to receiver's document
    receiver.referralRequests.push({
      referralId: sender.referrals[sender.referrals.length - 1]._id,
      senderEmail,
      senderName,
      senderPhoneNumber,
      isActive: true // Set isActive to true when adding the request
    });
    await receiver.save();

    res.send({ status: 'ok', message: 'Referral request sent successfully' });
  } catch (error) {
    console.error('Error sending referral request:', error);
    res.status(500).send({ status: 'error', message: 'Failed to send referral request' });
  }
});

app.post('/update-referral-status', async (req, res) => {
  const { referralId, status } = req.body;

  console.log('Received request to update referral status to', status, 'for referral ID', referralId);

  try {
    // Find the sender using the referralId
    const sender = await User.findOne({ 'referrals._id': referralId });
    if (!sender) {
      console.log('Sender not found!');
      return res.status(404).send({ status: 'error', message: "Sender doesn't exist!" });
    }

    const referral = sender.referrals.id(referralId);
    if (!referral) {
      console.log('Referral not found!');
      return res.status(404).send({ status: 'error', message: "Referral doesn't exist!" });
    }

    referral.referralAccepted = status;

    // Remove the referral request from the receiver's document
    const receiver = await User.findOne({ email: referral.receiverEmail });
    if (!receiver) {
      console.log('Receiver not found!');
      return res.status(404).send({ status: 'error', message: "Receiver doesn't exist!" });
    }

    const referralRequest = receiver.referralRequests.find(
      request => request.referralId.toString() === referralId
    );

    if (referralRequest) {
      referralRequest.isActive = false; // Set isActive to false
    }

    // Save the updates
    await receiver.save();
    await sender.save();

    res.send({ status: 'ok', message: 'Referral status updated successfully' });
  } catch (error) {
    console.error('Error updating referral status:', error);
    res.status(500).send({ status: 'error', message: 'Failed to update referral status' });
  }
});

app.get('/get-active-referral-requests', async (req, res) => {
  const email = req.query.email;

  try {
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).send({ status: 'error', message: "User doesn't exist!" });
    }

    const activeReferralRequests = user.referralRequests.filter(request => request.isActive);

    res.send({ status: 'ok', data: activeReferralRequests });
  } catch (error) {
    console.error('Error fetching active referral requests:', error);
    res.status(500).send({ status: 'error', message: 'Failed to fetch active referral requests' });
  }
});

app.listen(5001, () => {
    console.log("Node.js server started.");
});