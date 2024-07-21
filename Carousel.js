const mongoose = require('mongoose');

const carouselSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true,
      },
});

const Carousel = mongoose.model('Carousel', carouselSchema);

module.exports = Carousel;
