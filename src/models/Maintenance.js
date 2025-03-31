const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
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
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['preventive', 'corrective', 'emergency', 'inspection'],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    category: {
        type: String,
        enum: ['plumbing', 'electrical', 'structural', 'appliance', 'pest_control', 'cleaning', 'other'],
        required: true
    },
    schedule: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        isRecurring: {
            type: Boolean,
            default: false
        },
        recurrence: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
        }
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cost: {
        estimated: {
            type: Number,
            min: 0
        },
        actual: {
            type: Number,
            min: 0
        },
        currency: {
            type: String,
            default: 'IDR'
        }
    },
    attachments: [{
        url: String,
        caption: String,
        uploadedAt: Date
    }],
    notes: String,
    completionNotes: String,
    completedAt: Date,
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index untuk optimasi query
maintenanceSchema.index({ tenant: 1 });
maintenanceSchema.index({ property: 1 });
maintenanceSchema.index({ unit: 1 });
maintenanceSchema.index({ type: 1 });
maintenanceSchema.index({ priority: 1 });
maintenanceSchema.index({ status: 1 });
maintenanceSchema.index({ category: 1 });
maintenanceSchema.index({ 'schedule.startDate': 1 });
maintenanceSchema.index({ 'schedule.endDate': 1 });
maintenanceSchema.index({ assignedTo: 1 });
maintenanceSchema.index({ createdAt: -1 });

// Method untuk mendapatkan maintenance berdasarkan filter
maintenanceSchema.statics.findWithFilter = async function (query, options = {}) {
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
    const maintenances = await this.find(queryObj)
        .select(selectFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenant', 'name code')
        .populate('property', 'name')
        .populate('unit', 'number')
        .populate('assignedTo', 'name email')
        .populate('completedBy', 'name email');

    // Get total count
    const total = await this.countDocuments(queryObj);

    return {
        maintenances,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Method untuk mendapatkan statistik maintenance
maintenanceSchema.statics.getMaintenanceStats = async function (tenantId) {
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
                totalMaintenance: { $sum: 1 },
                types: {
                    $push: '$type'
                },
                priorities: {
                    $push: '$priority'
                },
                statuses: {
                    $push: '$status'
                },
                categories: {
                    $push: '$category'
                },
                completedMaintenance: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
                    }
                },
                totalCost: {
                    $sum: '$cost.actual'
                },
                averageCost: {
                    $avg: '$cost.actual'
                },
                overdueMaintenance: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$status', 'completed'] },
                                    { $lt: ['$schedule.endDate', new Date()] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                totalMaintenance: 1,
                completedMaintenance: 1,
                totalCost: 1,
                averageCost: 1,
                overdueMaintenance: 1,
                typeDistribution: {
                    $reduce: {
                        input: '$types',
                        initialValue: {},
                        in: {
                            $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $indexOfArray: ['$types', '$$this'] }, 1] } }
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
                },
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
                }
            }
        }
    ]);
};

const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

module.exports = Maintenance; 