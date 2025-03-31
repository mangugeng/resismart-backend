const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendEmail = async (options) => {
    try {
        const mailOptions = {
            from: `"ResiSmart" <${process.env.SMTP_USER}>`,
            to: options.email,
            subject: options.subject,
            html: options.html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email terkirim:', info.messageId);
        return true;
    } catch (error) {
        console.error('Error mengirim email:', error);
        return false;
    }
};

module.exports = {
    sendEmail,
    transporter,
}; 