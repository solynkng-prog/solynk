const sgMail = require('@sendgrid/mail');
const logger = require('./logger');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const EmailService = {
  async sendWelcomeEmail({ to, name }) {
    const msg = {
      to,
      from: process.env.EMAIL_FROM || 'noreply@solynk.com',
      subject: 'Welcome to SOLYNK — Your Solar Journey Starts Here',
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Welcome to SOLYNK, ${name}!</h1>
          <p>You're now part of the future of solar energy. Start designing your system today.</p>
          <a href="https://solynk.com/calculator" 
             style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; 
                    padding: 14px 32px; text-decoration: none; border-radius: 10px; 
                    display: inline-block; font-weight: 600; margin-top: 20px;">
            Start Calculating
          </a>
        </div>
      `,
    };
    return this.send(msg);
  },

  async sendPasswordReset({ to, resetUrl }) {
    const msg = {
      to,
      from: process.env.EMAIL_FROM || 'noreply@solynk.com',
      subject: 'Reset Your SOLYNK Password',
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Password Reset</h1>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" 
             style="background: #6366f1; color: white; padding: 14px 32px; 
                    text-decoration: none; border-radius: 10px; display: inline-block;">
            Reset Password
          </a>
        </div>
      `,
    };
    return this.send(msg);
  },

  async sendQuoteNotification({ to, installerName, projectName }) {
    const msg = {
      to,
      from: process.env.EMAIL_FROM || 'noreply@solynk.com',
      subject: `New Quote Request from ${installerName}`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">New Quote Request</h1>
          <p><strong>${installerName}</strong> has requested a quote for your project <strong>${projectName}</strong>.</p>
          <a href="https://solynk.com/dashboard/quotes" 
             style="background: #6366f1; color: white; padding: 14px 32px; 
                    text-decoration: none; border-radius: 10px; display: inline-block;">
            View Quote
          </a>
        </div>
      `,
    };
    return this.send(msg);
  },

  async send(msg) {
    if (!process.env.SENDGRID_API_KEY) {
      logger.info('Email skipped (no SendGrid key):', msg.to);
      return { skipped: true };
    }
    try {
      await sgMail.send(msg);
      logger.info('Email sent:', msg.to);
      return { sent: true };
    } catch (err) {
      logger.error('Email send failed:', err);
      throw err;
    }
  },
};

module.exports = EmailService;
