const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    unit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    resident: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['maintenance', 'security', 'noise', 'cleanliness', 'other'],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'resolved', 'closed'],
        default: 'pending'
    },
    attachments: [{
        url: String,
        caption: String,
        uploadedAt: Date
    }],
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: {
            type: String,
            required: true
        },
        attachments: [{
            url: String,
            caption: String,
            uploadedAt: Date
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    resolution: {
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date,
        notes: String
    },
    feedback: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: String,
        submittedAt: Date
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index untuk optimasi query
complaintSchema.index({ tenant: 1 });
complaintSchema.index({ property: 1 });
complaintSchema.index({ unit: 1 });
complaintSchema.index({ resident: 1 });
complaintSchema.index({ category: 1 });
complaintSchema.index({ priority: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ assignedTo: 1 });
complaintSchema.index({ createdAt: -1 });

// Method untuk mendapatkan keluhan berdasarkan filter
complaintSchema.statics.findWithFilter = async function (query, options = {}) {
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
            { title: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } }
        ];
    }

    // Select fields
    let selectFields = fields ? fields.split(',').join(' ') : '';

    // Execute query
    const complaints = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenant', 'name code')
        .populate('property', 'name')
        .populate('unit', 'number')
        .populate('resident', 'name email')
        .populate('assignedTo', 'name email')
        .populate('comments.user', 'name email')
        .populate('resolution.resolvedBy', 'name email');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        complaints,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik keluhan
complaintSchema.statics.getComplaintStats = async function (tenantId) {
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
                totalComplaints: { $sum: 1 },
                categories: {
                    $push: '$category'
                },
                priorities: {
                    $push: '$priority'
                },
                statuses: {
                    $push: '$status'
                },
                resolvedComplaints: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0]
                    }
                },
                averageResolutionTime: {
                    $avg: {
                        $cond: [
                            { $eq: ['$status', 'resolved'] },
                            { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
                            null
                        ]
                    }
                },
                averageRating: {
                    $avg: '$feedback.rating'
                }
            }
        },
        {
            $project: {
                _id: 0,
                totalComplaints: 1,
                resolvedComplaints: 1,
                averageResolutionTime: 1,
                averageRating: 1,
                categoryDistribution: {
                    $reduce: {
                        input: '$categories',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$categories', '$$this'] }, 1] } }
                            ]
                        }
                    }
                },
                priorityDistribution: {
                    $reduce: {
                        input: '$priorities',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$priorities', '$$this'] }, 1] } }
                            ]
                        }
                    }
                },
                statusDistribution: {
                    $reduce: {
                        input: '$statuses',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$statuses', '$$this'] }, 1] } }
                            ]
                        }
                    }
                }
            }
        }
    ]);
};

const Complaint = mongoose.model('Complaint', complaintSchema);

module.exports = Complaint; 