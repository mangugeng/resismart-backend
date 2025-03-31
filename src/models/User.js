const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'staff', 'resident'],
        default: 'resident'
    },
    phone: {
        type: String,
        trim: true
    },
    avatar: {
        url: String,
        caption: String
    },
    address: {
        street: String,
        city: String,
        state: String,
        postalCode: String
    },
    preferences: {
        language: {
            type: String,
            enum: ['id', 'en'],
            default: 'id'
        },
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            push: {
                type: Boolean,
                default: true
            },
            sms: {
                type: Boolean,
                default: false
            }
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        }
    },
    lastLogin: Date,
    loginHistory: [{
        date: Date,
        ip: String,
        device: String
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    emailVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpire: Date
}, {
    timestamps: true
});

// Index untuk optimasi query
userSchema.index({ tenant: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Hash password sebelum disimpan
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method untuk membandingkan password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method untuk mendapatkan user berdasarkan filter
userSchema.statics.findWithFilter = async function (query, options = {}) {
    const {
        page = 1,
        limit = 10,
        sort = '-createdAt',
        fields,
        ...filters
    } = options;

    // Build query
    const queryObj = { ...filters };
    if (query) {
        queryObj.$or = [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { phone: { $regex: query, $options: 'i' } }
        ];
    }

    // Select fields
    let selectFields = fields ? fields.split(',').join(' ') : '';

    // Execute query
    const users = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenant', 'name code');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        users,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik user
userSchema.statics.getUserStats = async function (tenantId) {
    return this.aggregate([
        {
            $match: {
                tenant: mongoose.Types.ObjectId(tenantId),
                isActive: true
            }
        },
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                roles: {
                    $push: '$role'
                },
                verifiedUsers: {
                    $sum: { $cond: [{ $eq: ['$emailVerified', true] }, 1, 0] }
                }
            }
        },
        {
            $project: {
                _id: 0,
                totalUsers: 1,
                verifiedUsers: 1,
                roleDistribution: {
                    $reduce: {
                        input: '$roles',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$roles', '$$this'] }, 1] } }
                            ]
                        }
                    }
                }
            }
        }
    ]);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 