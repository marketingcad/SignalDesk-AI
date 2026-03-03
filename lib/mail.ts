import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Reset your SignalDesk AI password",
    text: `You requested a password reset. Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Reset your password</h2>
        <p style="color: #555; line-height: 1.6;">
          You requested a password reset for your SignalDesk AI account. Click the button below to choose a new password.
        </p>
        <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 12px 32px; background-color: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          This link expires in 1 hour. If you didn&rsquo;t request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
