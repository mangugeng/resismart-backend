const Redis = require('ioredis');
const { logger } = require('./logger');

// Inisialisasi Redis client
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// Event handlers
redisClient.on('connect', () => {
    logger.info('Redis connected successfully');
});

redisClient.on('error', (error) => {
    logger.error('Redis connection error:', error);
});

// Fungsi untuk mendapatkan data dari cache
const getCache = async (key) => {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        logger.error('Error getting cache:', error);
        return null;
    }
};

// Fungsi untuk menyimpan data ke cache
const setCache = async (key, value, expireSeconds = 300) => {
    try {
        await redisClient.setex(key, expireSeconds, JSON.stringify(value));
        return true;
    } catch (error) {
        logger.error('Error setting cache:', error);
        return false;
    }
};

// Fungsi untuk menghapus cache
const deleteCache = async (pattern) => {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
            logger.info(`Deleted ${keys.length} cache keys matching pattern: ${pattern}`);
        }
        return true;
    } catch (error) {
        logger.error('Error deleting cache:', error);
        return false;
    }
};

// Fungsi untuk membersihkan semua cache
const clearAllCache = async () => {
    try {
        await redisClient.flushall();
        logger.info('All cache cleared');
        return true;
    } catch (error) {
        logger.error('Error clearing cache:', error);
        return false;
    }
};

module.exports = {
    redisClient,
    getCache,
    setCache,
    deleteCache,
    clearAllCache
}; 