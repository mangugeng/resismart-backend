const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    unitNumber: {
        type: String,
        required: true,
        trim: true
    },
    floor: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['studio', '1BR', '2BR', '3BR', 'penthouse'],
        required: true
    },
    size: {
        type: Number,
        required: true,
        min: 0
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['available', 'occupied', 'maintenance', 'reserved'],
        default: 'available'
    },
    amenities: [{
        type: String,
        enum: ['parking', 'balcony', 'garden', 'pool', 'gym']
    }],
    images: [{
        url: String,
        caption: String
    }],
    currentTenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    maintenanceHistory: [{
        date: Date,
        description: String,
        cost: Number,
        performedBy: String
    }],
    documents: [{
        name: String,
        url: String,
        type: String,
        uploadedAt: Date
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index untuk optimasi query
unitSchema.index({ property: 1, unitNumber: 1 }, { unique: true });
unitSchema.index({ status: 1 });
unitSchema.index({ type: 1 });
unitSchema.index({ price: 1 });

// Method untuk mendapatkan unit berdasarkan filter
unitSchema.statics.findWithFilter = async function (query, options = {}) {
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
            { unitNumber: { $regex: query, $options: 'i' } },
            { type: { $regex: query, $options: 'i' } }
        ];
    }

    // Select fields
    let selectFields = fields ? fields.split(',').join(' ') : '';

    // Execute query
    const units = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('property', 'name address')
        .populate('currentTenant', 'name email');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        units,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik unit
unitSchema.statics.getUnitStats = async function (propertyId) {
    return this.aggregate([
        {
            $match: {
                property: mongoose.Types.ObjectId(propertyId),
                isActive: true
            }
        },
        {
            $group: {
                _id: null,
                totalUnits: { $sum: 1 },
                availableUnits: {
                    $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] }
                },
                occupiedUnits: {
                    $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] }
                },
                maintenanceUnits: {
                    $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] }
                },
                averagePrice: { $avg: '$price' },
                unitTypes: {
                    $push: '$type'
                }
            }
        },
        {
            $project: {
                _id: 0,
                totalUnits: 1,
                availableUnits: 1,
                occupiedUnits: 1,
                maintenanceUnits: 1,
                averagePrice: 1,
                unitTypeDistribution: {
                    $reduce: {
                        input: '$unitTypes',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$unitTypes', '$$this'] }, 1] } }
                            ]
                        }
                    }
                }
            }
        }
    ]);
};

const Unit = mongoose.model('Unit', unitSchema);

module.exports = Unit; 