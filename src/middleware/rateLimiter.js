const rateLimit = require('express-rate-limit');
const { redisClient } = require('../config/cache');

// Rate limiter untuk API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // maksimal 100 request per windowMs
    message: {
        success: false,
        message: 'Terlalu banyak request, silakan coba lagi dalam beberapa menit.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: {
        incr: async (key) => {
            const multi = redisClient.multi();
            multi.incr(key);
            multi.expire(key, 15 * 60); // 15 menit
            const results = await multi.exec();
            return results[0][1];
        },
        decr: async (key) => {
            await redisClient.decr(key);
        },
        resetKey: async (key) => {
            await redisClient.del(key);
        }
    }
});

// Rate limiter untuk auth routes
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max: 5, // maksimal 5 request per windowMs
    message: {
        success: false,
        message: 'Terlalu banyak percobaan login, silakan coba lagi dalam 1 jam.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: {
        incr: async (key) => {
            const multi = redisClient.multi();
            multi.incr(key);
            multi.expire(key, 60 * 60); // 1 jam
            const results = await multi.exec();
            return results[0][1];
        },
        decr: async (key) => {
            await redisClient.decr(key);
        },
        resetKey: async (key) => {
            await redisClient.del(key);
        }
    }
});

module.exports = {
    apiLimiter,
    authLimiter
}; 